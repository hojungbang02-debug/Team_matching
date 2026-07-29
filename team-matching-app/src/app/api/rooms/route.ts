import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  hashSessionToken,
  setTeacherSession,
} from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const CriterionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  weight: z.number().min(0).max(1),
});

const CreateRoomSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  className: z.string().trim().max(80),
  question: z.string().trim().min(5).max(1000),
  expectedCount: z.number().int().positive().optional(),
  teamMode: z.enum(["auto", "fixed"]),
  fixedTeamCount: z.number().int().positive().optional(),
  targetTeamSize: z.number().int().min(2).max(12),
  recommendedMax: z.number().int().min(2).max(12),
  hardMax: z.number().int().min(2).max(12),
  password: z.string().min(4).max(100),
  rubric: z.array(CriterionSchema).min(1).max(6),
  rubricSource: z.enum(["gemini", "teacher", "demo-fallback"]),
});

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createRoomCode(): string {
  return Array.from(
    { length: 6 },
    () => alphabet[randomInt(0, alphabet.length)],
  ).join("");
}

export async function POST(request: Request) {
  const parsed = CreateRoomSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "룸 설정 값을 확인해 주세요." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const teacherToken = createSessionToken();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = createRoomCode();
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({
        room_code: roomCode,
        subject: parsed.data.subject,
        title: parsed.data.title,
        class_name: parsed.data.className || null,
        question: parsed.data.question,
        expected_count: parsed.data.expectedCount ?? null,
        team_mode: parsed.data.teamMode,
        fixed_team_count: parsed.data.fixedTeamCount ?? null,
        target_team_size: parsed.data.targetTeamSize,
        recommended_max: parsed.data.recommendedMax,
        hard_max: parsed.data.hardMax,
        password_hash: passwordHash,
        teacher_token_hash: hashSessionToken(teacherToken),
      })
      .select("id, room_code, phase")
      .single();

    if (error) {
      if (error.code === "23505") continue;
      console.error("Supabase room insert failed:", error.code, error.message);
      return NextResponse.json(
        {
          error: "룸 생성 중 데이터베이스 오류가 발생했습니다.",
          details:
            process.env.NODE_ENV === "development"
              ? `${error.code}: ${error.message}`
              : undefined,
        },
        { status: 500 },
      );
    }

    const { error: rubricError } = await supabase
      .from("room_rubrics")
      .insert({
        room_id: room.id,
        criteria: parsed.data.rubric,
        source: parsed.data.rubricSource,
      });

    if (rubricError) {
      await supabase.from("rooms").delete().eq("id", room.id);
      return NextResponse.json(
        { error: "매칭 기준 저장에 실패했습니다." },
        { status: 500 },
      );
    }

    await setTeacherSession(room.id, teacherToken);
    return NextResponse.json({
      id: room.id,
      code: room.room_code,
      phase: room.phase,
    });
  }

  return NextResponse.json(
    { error: "룸 코드를 만들지 못했습니다. 다시 시도해 주세요." },
    { status: 503 },
  );
}
