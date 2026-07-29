import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParticipant } from "@/lib/rooms";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const ResponseSchema = z.object({
  answer: z.string().max(3000),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const parsed = ResponseSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "답변 형식을 확인해 주세요." }, { status: 400 });
  }

  const { code } = await context.params;
  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, phase")
    .eq("room_code", code.toUpperCase())
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "룸을 찾을 수 없습니다." }, { status: 404 });
  }
  const participant = await requireParticipant(room.id);
  if (!participant) {
    return NextResponse.json({ error: "세션이 유효하지 않습니다." }, { status: 401 });
  }
  if (room.phase !== "collecting") {
    return NextResponse.json({ error: "현재 답변을 제출할 수 없습니다." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("responses").upsert(
    {
      room_id: room.id,
      participant_id: participant.id,
      answer: parsed.data.answer,
      submitted: true,
      submitted_at: now,
    },
    { onConflict: "participant_id" },
  );

  if (error) {
    return NextResponse.json({ error: "답변 저장에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ submitted: true, submittedAt: now });
}
