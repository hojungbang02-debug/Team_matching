import { NextResponse } from "next/server";
import { requireParticipant, requireTeacherRoom } from "@/lib/rooms";
import { getSupabaseAdmin } from "@/lib/supabase/server";

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
      "id, room_code, subject, title, class_name, question, phase, expected_count",
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
    });
  }

  const { data: participantRows } = await supabase
    .from("participants")
    .select(
      "id, student_number, display_name, status, joined_at, responses(answer, submitted, submitted_at)",
    )
    .eq("room_id", room.id)
    .order("joined_at");

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.room_code,
      subject: room.subject,
      title: room.title,
      className: room.class_name,
      question: room.question,
      phase: room.phase,
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
