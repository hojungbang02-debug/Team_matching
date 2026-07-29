import { NextResponse } from "next/server";
import { requireParticipant, requireTeacherRoom } from "@/lib/rooms";
import { clearTeacherSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * 수업이 끝나면 교사가 룸을 통째로 지웁니다.
 * rooms를 삭제하면 참가자, 답변, 분석, 매칭 이력, 팀 결과가 함께 삭제됩니다.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await requireTeacherRoom(code);
  if (!room) {
    return NextResponse.json(
      { error: "교사 세션이 유효하지 않습니다." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("rooms").delete().eq("id", room.id);
  if (error) {
    console.error("Room delete failed:", error.message);
    return NextResponse.json(
      { error: "룸 삭제에 실패했습니다." },
      { status: 500 },
    );
  }

  await clearTeacherSession();
  return NextResponse.json({ deleted: true });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const roomCode = code.toUpperCase();
  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("rooms")
    .select(
      "id, room_code, subject, title, class_name, question, phase, expected_count, team_mode, fixed_team_count, target_team_size, recommended_max, hard_max",
    )
    .eq("room_code", roomCode)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "룸을 찾을 수 없습니다." }, { status: 404 });
  }

  const teacherRoom = await requireTeacherRoom(roomCode);
  const participant = teacherRoom ? null : await requireParticipant(room.id);
  if (!teacherRoom && !participant) {
    return NextResponse.json({ error: "세션이 유효하지 않습니다." }, { status: 401 });
  }

  const { count } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)
    .in("status", ["active", "pending"]);

  if (!teacherRoom) {
    const { data: response } = await supabase
      .from("responses")
      .select("answer, submitted, submitted_at")
      .eq("participant_id", participant!.id)
      .maybeSingle();

    return NextResponse.json({
      room: {
        code: room.room_code,
        subject: room.subject,
        title: room.title,
        className: room.class_name,
        question: room.question,
        phase: room.phase,
      },
      participantCount: count ?? 0,
      participant: {
        id: participant!.id,
        number: participant!.student_number ?? "",
        name: participant!.display_name,
        answer: response?.answer ?? "",
        submitted: response?.submitted ?? false,
        submittedAt: response?.submitted_at ?? undefined,
      },
    });
  }

  const [{ data: participantRows }, { data: rubric }] = await Promise.all([
    supabase
      .from("participants")
      .select(
        "id, student_number, display_name, status, joined_at, responses(answer, submitted, submitted_at)",
      )
      .eq("room_id", room.id)
      .order("joined_at"),
    supabase
      .from("room_rubrics")
      .select("criteria, source")
      .eq("room_id", room.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.room_code,
      subject: room.subject,
      title: room.title,
      className: room.class_name,
      question: room.question,
      phase: room.phase,
      expectedCount: room.expected_count,
      teamMode: room.team_mode,
      fixedTeamCount: room.fixed_team_count,
      targetTeamSize: room.target_team_size,
      recommendedMax: room.recommended_max,
      hardMax: room.hard_max,
      rubric: rubric?.criteria ?? [],
      rubricSource: rubric?.source ?? "teacher",
    },
    participantCount: count ?? 0,
    participants: (participantRows ?? []).map((row) => {
      const response = Array.isArray(row.responses)
        ? row.responses[0]
        : row.responses;
      return {
        id: row.id,
        number: row.student_number ?? "",
        name: row.display_name,
        answer: response?.answer ?? "",
        submitted: response?.submitted ?? false,
        submittedAt: response?.submitted_at ?? undefined,
      };
    }),
  });
}
