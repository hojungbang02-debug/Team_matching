import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherRoom } from "@/lib/rooms";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const PhaseSchema = z.object({
  phase: z.enum([
    "waiting",
    "collecting",
    "locked",
    "analyzing",
    "review",
    "completed",
  ]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const parsed = PhaseSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "진행 단계를 확인해 주세요." }, { status: 400 });
  }

  const { code } = await context.params;
  const room = await requireTeacherRoom(code);
  if (!room) {
    return NextResponse.json({ error: "교사 세션이 유효하지 않습니다." }, { status: 401 });
  }

  const timestamps: Record<string, string | null> = {};
  const now = new Date().toISOString();
  if (parsed.data.phase === "collecting") timestamps.question_opened_at = now;
  if (parsed.data.phase === "locked") timestamps.responses_locked_at = now;
  if (parsed.data.phase === "completed") timestamps.completed_at = now;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("rooms")
    .update({ phase: parsed.data.phase, ...timestamps })
    .eq("id", room.id);

  if (error) {
    return NextResponse.json({ error: "진행 단계 저장에 실패했습니다." }, { status: 500 });
  }

  // 확정 시 가장 최근 매칭 실행을 완료 상태로 남깁니다. 실패해도 단계 저장은 유지합니다.
  if (parsed.data.phase === "completed") {
    try {
      const { data: latestRun } = await supabase
        .from("matching_runs")
        .select("id")
        .eq("room_id", room.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestRun) {
        await supabase
          .from("matching_runs")
          .update({ status: "completed" })
          .eq("id", latestRun.id);
        await supabase
          .from("teams")
          .update({ is_confirmed: true })
          .eq("matching_run_id", latestRun.id);
      }
    } catch (confirmError) {
      console.error("Marking matching run completed failed:", confirmError);
    }
  }

  return NextResponse.json({ phase: parsed.data.phase });
}
