import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  hashSessionToken,
  setParticipantSession,
} from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const JoinSchema = z.object({
  password: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  number: z.string().trim().max(30).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const parsed = JoinSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "입장 정보를 확인해 주세요." }, { status: 400 });
  }

  const { code } = await context.params;
  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, phase, password_hash")
    .eq("room_code", code.toUpperCase())
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "룸을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!(await bcrypt.compare(parsed.data.password, room.password_hash))) {
    return NextResponse.json({ error: "참여 암호가 올바르지 않습니다." }, { status: 401 });
  }
  if (!["waiting", "collecting"].includes(room.phase)) {
    return NextResponse.json({ error: "현재 입장할 수 없는 룸입니다." }, { status: 409 });
  }

  const token = createSessionToken();
  const normalizedIdentifier = `${parsed.data.number ?? ""}:${parsed.data.name}`
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  const { data: participant, error } = await supabase
    .from("participants")
    .insert({
      room_id: room.id,
      display_name: parsed.data.name,
      student_number: parsed.data.number || null,
      normalized_identifier: normalizedIdentifier,
      session_token_hash: hashSessionToken(token),
      status: "active",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "이미 입장한 이름 또는 학번입니다."
            : "학생 등록에 실패했습니다.",
      },
      { status: error.code === "23505" ? 409 : 500 },
    );
  }

  await setParticipantSession(participant.id, token);
  return NextResponse.json({ participantId: participant.id, phase: room.phase });
}
