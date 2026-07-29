import { NextResponse } from "next/server";
import { z } from "zod";
import { requireParticipant, requireTeacherRoom } from "@/lib/rooms";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const MemberSchema = z.object({
  participantId: z.string().uuid(),
  similarity: z.number().min(0).max(1).nullable(),
  matchingInformationScore: z.number().min(0).max(1),
  matchingMethod: z.enum(["seed", "semantic", "balanced", "teacher"]),
});

const ConfirmSchema = z.object({
  runId: z.string().uuid(),
  teams: z
    .array(
      z.object({
        seedParticipantId: z.string().uuid().nullable(),
        representativeIdea: z.string().max(400),
        commonTopic: z.string().max(400),
        reason: z.string().max(400),
        members: z.array(MemberSchema).max(60),
      }),
    )
    .min(1)
    .max(20),
});

type RosterRow = {
  id: string;
  student_number: string | null;
  display_name: string;
};

async function loadRoster(roomId: string): Promise<Map<string, RosterRow>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("participants")
    .select("id, student_number, display_name")
    .eq("room_id", roomId);
  if (error) throw error;
  return new Map(
    ((data ?? []) as RosterRow[]).map((row) => [row.id, row]),
  );
}

/**
 * 교사가 검토 화면에서 확정한 팀 구성을 저장합니다.
 * 수동으로 옮긴 학생까지 반영해 team_members를 다시 씁니다.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const parsed = ConfirmSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "확정할 팀 구성 형식을 확인해 주세요." },
      { status: 400 },
    );
  }

  const { code } = await context.params;
  const room = await requireTeacherRoom(code);
  if (!room) {
    return NextResponse.json(
      { error: "교사 세션이 유효하지 않습니다." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: run } = await supabase
    .from("matching_runs")
    .select("id")
    .eq("id", parsed.data.runId)
    .eq("room_id", room.id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json(
      { error: "확정할 매칭 실행 이력을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 클라이언트가 보낸 학생이 실제로 이 룸의 참가자인지 확인합니다.
  const roster = await loadRoster(room.id);
  const assigned = new Set<string>();
  for (const team of parsed.data.teams) {
    for (const member of team.members) {
      if (!roster.has(member.participantId) || assigned.has(member.participantId)) {
        return NextResponse.json(
          { error: "팀 구성에 이 룸의 학생이 아니거나 중복된 학생이 있습니다." },
          { status: 400 },
        );
      }
      assigned.add(member.participantId);
    }
  }

  const { data: storedTeams, error: teamLoadError } = await supabase
    .from("teams")
    .select("id, team_number")
    .eq("matching_run_id", run.id)
    .order("team_number");
  if (teamLoadError) {
    return NextResponse.json(
      { error: "저장된 팀 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
  if ((storedTeams ?? []).length !== parsed.data.teams.length) {
    return NextResponse.json(
      { error: "저장된 팀 수와 확정 요청의 팀 수가 다릅니다." },
      { status: 409 },
    );
  }

  try {
    for (const [index, team] of parsed.data.teams.entries()) {
      const stored = storedTeams![index];
      const { error } = await supabase
        .from("teams")
        .update({
          seed_participant_id: team.seedParticipantId,
          representative_idea: team.representativeIdea,
          common_topic: team.commonTopic,
          reason: team.reason,
          is_confirmed: true,
        })
        .eq("id", stored.id);
      if (error) throw error;
    }

    const { error: clearError } = await supabase
      .from("team_members")
      .delete()
      .eq("matching_run_id", run.id);
    if (clearError) throw clearError;

    const memberRows = parsed.data.teams.flatMap((team, index) =>
      team.members.map((member) => ({
        matching_run_id: run.id,
        team_id: storedTeams![index].id,
        participant_id: member.participantId,
        similarity: member.similarity,
        information_score: member.matchingInformationScore,
        matching_method: member.matchingMethod,
      })),
    );
    if (memberRows.length) {
      const { error: memberError } = await supabase
        .from("team_members")
        .insert(memberRows);
      if (memberError) throw memberError;
    }

    const now = new Date().toISOString();
    const [{ error: runError }, { error: roomError }] = await Promise.all([
      supabase
        .from("matching_runs")
        .update({ status: "completed" })
        .eq("id", run.id),
      supabase
        .from("rooms")
        .update({ phase: "completed", completed_at: now })
        .eq("id", room.id),
    ]);
    if (runError) throw runError;
    if (roomError) throw roomError;
  } catch (error) {
    console.error("Confirming team result failed:", error);
    return NextResponse.json(
      { error: "팀 구성 확정을 저장하지 못했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ confirmed: true, phase: "completed" });
}

/**
 * 확정된 팀 결과를 돌려줍니다.
 * 학생에게는 본인이 속한 팀과 팀원 이름만 보여주고 답변이나 점수는 내보내지 않습니다.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const roomCode = code.toUpperCase();
  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, phase")
    .eq("room_code", roomCode)
    .maybeSingle();
  if (!room) {
    return NextResponse.json(
      { error: "룸을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const teacherRoom = await requireTeacherRoom(roomCode);
  const participant = teacherRoom ? null : await requireParticipant(room.id);
  if (!teacherRoom && !participant) {
    return NextResponse.json(
      { error: "세션이 유효하지 않습니다." },
      { status: 401 },
    );
  }
  if (room.phase !== "completed") {
    return NextResponse.json(
      { error: "아직 확정된 팀 구성이 없습니다." },
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

  const [{ data: teams }, roster] = await Promise.all([
    supabase
      .from("teams")
      .select(
        "team_number, representative_idea, common_topic, team_members(participant_id)",
      )
      .eq("matching_run_id", run.id)
      .order("team_number"),
    loadRoster(room.id),
  ]);

  const toTeam = (
    team: NonNullable<typeof teams>[number],
    viewerId?: string,
  ) => ({
    number: team.team_number,
    name: `${team.team_number}조`,
    representativeIdea: team.representative_idea ?? "",
    commonTopic: team.common_topic ?? "",
    members: (team.team_members ?? [])
      .map((member: { participant_id: string }) => {
        const row = roster.get(member.participant_id);
        return row
          ? {
              number: row.student_number ?? "",
              name: row.display_name,
              isMe: viewerId === member.participant_id,
            }
          : null;
      })
      .filter((member): member is NonNullable<typeof member> => Boolean(member)),
  });

  if (teacherRoom) {
    return NextResponse.json({
      teams: (teams ?? []).map((team) => toTeam(team)),
    });
  }

  const myTeam = (teams ?? []).find((team) =>
    (team.team_members ?? []).some(
      (member: { participant_id: string }) =>
        member.participant_id === participant!.id,
    ),
  );
  if (!myTeam) {
    return NextResponse.json(
      { error: "배정된 팀을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return NextResponse.json({ team: toTeam(myTeam, participant!.id) });
}
