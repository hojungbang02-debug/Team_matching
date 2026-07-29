import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error("Supabase 환경변수가 없습니다.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let roomId;

async function request(path, init = {}, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `${path}: ${data.error ?? response.statusText}${data.details ? ` (${data.details})` : ""}`,
    );
  }
  return { data, cookie: response.headers.get("set-cookie") };
}

try {
  const created = await request("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      subject: "CodexTest",
      title: "Codex Supabase integration test",
      className: "test",
      question: "통합 테스트를 위한 질문입니다.",
      expectedCount: 1,
      teamMode: "auto",
      targetTeamSize: 2,
      recommendedMax: 2,
      hardMax: 3,
      password: "codex-test-only",
      rubric: [
        {
          key: "topic",
          label: "주제",
          description: "테스트 기준",
          weight: 1,
        },
      ],
      rubricSource: "teacher",
    }),
  });
  roomId = created.data.id;
  const roomCode = created.data.code;
  const teacherCookie = created.cookie;

  const joined = await request(`/api/rooms/${roomCode}/join`, {
    method: "POST",
    body: JSON.stringify({
      password: "codex-test-only",
      name: "통합테스트학생",
      number: "T01",
    }),
  });
  const studentCookie = joined.cookie;

  await request(
    `/api/rooms/${roomCode}/phase`,
    { method: "PATCH", body: JSON.stringify({ phase: "collecting" }) },
    teacherCookie,
  );
  await request(
    `/api/rooms/${roomCode}/response`,
    {
      method: "PUT",
      body: JSON.stringify({ answer: "Supabase 저장 통합 테스트 답변" }),
    },
    studentCookie,
  );
  const snapshot = await request(
    `/api/rooms/${roomCode}`,
    { method: "GET" },
    teacherCookie,
  );
  const participant = snapshot.data.participants?.[0];
  if (
    snapshot.data.participants?.length !== 1 ||
    !participant?.submitted ||
    participant.answer !== "Supabase 저장 통합 테스트 답변"
  ) {
    throw new Error("저장된 룸/학생/답변 검증에 실패했습니다.");
  }

  const matched = await request(
    "/api/match",
    {
      method: "POST",
      body: JSON.stringify({
        roomCode,
        question: "통합 테스트를 위한 질문입니다.",
        rubric: [
          {
            key: "topic",
            label: "주제",
            description: "테스트 기준",
            weight: 1,
          },
        ],
        participants: snapshot.data.participants,
        requestedTeamCount: 1,
        hardMax: 3,
      }),
    },
    teacherCookie,
  );
  if (!matched.data.runId) {
    throw new Error("매칭 실행 이력이 저장되지 않았습니다.");
  }
  const { data: storedRun, error: runError } = await supabase
    .from("matching_runs")
    .select("id, response_analyses(id), teams(id), team_members(id)")
    .eq("id", matched.data.runId)
    .single();
  if (
    runError ||
    !storedRun ||
    storedRun.response_analyses.length !== 1 ||
    storedRun.teams.length !== 1 ||
    storedRun.team_members.length !== 1
  ) {
    throw new Error("매칭 상세 결과 DB 저장 검증에 실패했습니다.");
  }

  console.log(
    "룸 생성, 학생 입장, 답변, Gemini 매칭 결과 저장 통합 확인 성공",
  );
} finally {
  if (roomId) {
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) {
      console.error("통합 테스트 룸 정리 실패:", error.message);
      process.exitCode = 1;
    }
  }
}
