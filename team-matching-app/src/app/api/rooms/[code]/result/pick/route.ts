import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParticipant } from "@/lib/rooms";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const PickSchema = z.object({
  teamNumber: z.number().int().min(1).max(20),
});

/**
 * 자동 배정에서 빠진 학생이 조를 직접 고릅니다.
 * 확정된 매칭 실행에만 적용하고, 남은 자리를 넘겨 받지 않도록 정원을 확인합니다.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const parsed = PickSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "선택한 조 번호를 확인해 주세요." },
      { status: 400 },
    );
  }

  const { code } = await context.params;
  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, phase")
    .eq("room_code", code.toUpperCase())
    .maybeSingle();
  if (!room) {
    return NextResponse.json(
      { error: "룸을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const participant = await requireParticipant(room.id);
  if (!participant) {
    return NextResponse.json(
      { error: "세션이 유효하지 않습니다." },
      { status: 401 },
    );
  }
  if (room.phase !== "completed") {
    return NextResponse.json(
      { error: "아직 조를 고를 수 없습니다." },
      { status: 409 },
    );
  }

  const { data: run } = await supabase
    .from("matching_runs")
    .select("id")
    .eq("room_id", room.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) {
    return NextResponse.json(
      { error: "확정된 팀 구성을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const { data: existing } = await supabase
    .from("team_members")
    .select("id")
    .eq("matching_run_id", run.id)
    .eq("participant_id", participant.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "이미 배정된 조가 있습니다." },
      { status: 409 },
    );
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, team_number, target_capacity, team_members(participant_id)")
    .eq("matching_run_id", run.id)
    .eq("team_number", parsed.data.teamNumber)
    .maybeSingle();
  if (!team) {
    return NextResponse.json(
      { error: "선택한 조를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if ((team.team_members ?? []).length >= team.target_capacity) {
    return NextResponse.json(
      { error: "선택한 조의 자리가 이미 찼습니다. 다른 조를 골라 주세요." },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("team_members").insert({
    matching_run_id: run.id,
    team_id: team.id,
    participant_id: participant.id,
    similarity: null,
    information_score: 0,
    matching_method: "teacher",
  });
  if (error) {
    // unique(matching_run_id, participant_id) 위반이면 동시에 다른 요청이 배정한 것입니다.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "이미 배정된 조가 있습니다." },
        { status: 409 },
      );
    }
    console.error("Team pick failed:", error.message);
    return NextResponse.json(
      { error: "조 선택을 저장하지 못했습니다." },
      { status: 500 },
    );
  }

  // 동시에 마지막 자리를 고른 경우를 대비해 저장 후 정원을 다시 확인합니다.
  const { count } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id);
  if ((count ?? 0) > team.target_capacity) {
    await supabase
      .from("team_members")
      .delete()
      .eq("matching_run_id", run.id)
      .eq("participant_id", participant.id);
    return NextResponse.json(
      { error: "선택한 조의 자리가 이미 찼습니다. 다른 조를 골라 주세요." },
      { status: 409 },
    );
  }

  return NextResponse.json({ picked: true, teamNumber: team.team_number });
}
