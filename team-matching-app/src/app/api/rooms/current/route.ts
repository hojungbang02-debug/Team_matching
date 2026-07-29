import { NextResponse } from "next/server";
import { getTeacherSession, hashSessionToken } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const session = await getTeacherSession();
  if (!session) {
    return NextResponse.json(
      { error: "진행 중인 교사 세션이 없습니다." },
      { status: 404 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("rooms")
    .select("room_code, title, class_name, phase")
    .eq("id", session.id)
    .eq("teacher_token_hash", hashSessionToken(session.token))
    .maybeSingle();

  if (!room) {
    return NextResponse.json(
      { error: "교사 세션이 만료되었습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    code: room.room_code,
    title: room.title,
    className: room.class_name,
    phase: room.phase,
  });
}
