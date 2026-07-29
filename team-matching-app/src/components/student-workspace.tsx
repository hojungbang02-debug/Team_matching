"use client";

import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";

type StudentPhase = "join" | "waiting" | "answer" | "submitted" | "result";

type StudentRoomSnapshot = {
  participantCount: number;
  room: {
    subject: string;
    title: string;
    className: string | null;
    question: string;
    phase: string;
  };
  participant?: {
    number: string;
    name: string;
    answer: string;
    submitted: boolean;
  };
};

type StudentTeamResult = {
  number: number;
  name: string;
  representativeIdea: string;
  commonTopic: string;
  members: { number: string; name: string; isMe: boolean }[];
};

const answerDraftKey = (roomCode: string) =>
  `team-matching:answer-draft:${roomCode.toUpperCase()}`;

export function StudentWorkspace({
  initialRoomCode = "",
}: {
  initialRoomCode?: string;
}) {
  const [phase, setPhase] = useState<StudentPhase>("join");
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [room, setRoom] = useState<{
    subject: string;
    title: string;
    className: string | null;
    question: string;
  } | null>(null);
  const [teamResult, setTeamResult] = useState<StudentTeamResult | null>(null);
  const [roomClosed, setRoomClosed] = useState(false);

  const applyRoomSnapshot = useCallback(
    (data: StudentRoomSnapshot, restoreAnswer = false) => {
      setParticipantCount(data.participantCount);
      setRoom(data.room);
      if (data.participant) {
        setName(
          [data.participant.number, data.participant.name]
            .filter(Boolean)
            .join(" "),
        );

        if (data.participant.submitted) {
          setAnswer(data.participant.answer);
          window.sessionStorage.removeItem(answerDraftKey(roomCode));
        } else if (restoreAnswer) {
          const draft = window.sessionStorage.getItem(
            answerDraftKey(roomCode),
          );
          setAnswer(draft ?? data.participant.answer);
        }
      }

      if (data.room.phase === "completed") {
        setPhase("result");
      } else if (data.room.phase === "collecting") {
        setPhase(data.participant?.submitted ? "submitted" : "answer");
      } else if (
        ["locked", "analyzing", "review"].includes(data.room.phase)
      ) {
        setPhase("submitted");
      } else {
        setPhase("waiting");
      }
    },
    [roomCode],
  );

  useEffect(() => {
    if (!initialRoomCode) return;

    let cancelled = false;
    async function restoreSession() {
      try {
        const response = await fetch(
          `/api/rooms/${initialRoomCode.toUpperCase()}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as StudentRoomSnapshot;
        if (!cancelled) applyRoomSnapshot(data, true);
      } catch {
        // 입장 화면에서 다시 시도할 수 있습니다.
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [applyRoomSnapshot, initialRoomCode]);

  useEffect(() => {
    if (phase === "join" || roomClosed) return;

    let cancelled = false;
    async function refreshRoom() {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`, {
          cache: "no-store",
        });
        // 교사가 수업을 종료하면 룸 데이터가 삭제되어 404가 됩니다.
        if (response.status === 404) {
          if (!cancelled) {
            setRoomClosed(true);
            setNotice("수업이 종료되어 룸 정보가 삭제되었습니다.");
          }
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as StudentRoomSnapshot;
        if (cancelled) return;
        applyRoomSnapshot(data);
      } catch {
        // 다음 polling 주기에서 다시 시도합니다.
      }
    }

    void refreshRoom();
    const timer = window.setInterval(refreshRoom, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyRoomSnapshot, phase, roomClosed, roomCode]);

  useEffect(() => {
    if (phase !== "result" || !roomCode || teamResult) return;

    let cancelled = false;
    async function loadTeamResult() {
      try {
        const response = await fetch(`/api/rooms/${roomCode}/result`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { team: StudentTeamResult };
        if (!cancelled) setTeamResult(data.team);
      } catch {
        // 결과가 준비되면 다시 시도합니다.
      }
    }

    void loadTeamResult();
    const timer = window.setInterval(loadTeamResult, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, roomCode, teamResult]);

  async function joinRoom() {
    setLoading(true);
    setNotice(null);
    try {
      const trimmed = name.trim();
      const match = trimmed.match(/^(\S+)\s+(.+)$/);
      const response = await fetch(`/api/rooms/${roomCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          number: match?.[1] ?? "",
          name: match?.[2] ?? trimmed,
        }),
      });
      const data = (await response.json()) as {
        phase?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "룸 입장 실패");
      setPhase(data.phase === "collecting" ? "answer" : "waiting");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "룸 입장 실패");
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/rooms/${roomCode}/response`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "답변 제출 실패");
      window.sessionStorage.removeItem(answerDraftKey(roomCode));
      setPhase("submitted");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "답변 제출 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="student-shell">
      <AppHeader
        role="학생"
        title={room?.title ?? "수업 팀 매칭"}
        subtitle={
          room
            ? `${room.subject}${room.className ? ` · ${room.className}` : ""}`
            : "룸에 입장해 주세요"
        }
      />
      <main className="student-main">
        <div className="student-progress">
          {["입장", "대기", "응답", "제출", "결과"].map((label, index) => {
            const phases: StudentPhase[] = [
              "join",
              "waiting",
              "answer",
              "submitted",
              "result",
            ];
            const current = phases.indexOf(phase);
            return (
              <div
                key={label}
                className={
                  index < current
                    ? "done"
                    : index === current
                      ? "active"
                      : ""
                }
              >
                <span>{index < current ? "✓" : index + 1}</span>
                <small>{label}</small>
              </div>
            );
          })}
        </div>

        {phase === "join" ? (
          <section className="student-card">
            <span className="student-icon">↗</span>
            <span className="eyebrow">JOIN A ROOM</span>
            <h1>수업 룸에 입장하세요</h1>
            <div className="student-form">
              <label>
                룸 코드
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value)}
                />
              </label>
              <label>
                참여 암호
                <input
                  type="password"
                  placeholder="교사가 안내한 암호"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                이름 또는 학번
                <input
                  placeholder="예: 17 이서준"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </div>
            <button
              className="button primary full"
              disabled={
                loading ||
                !name.trim() ||
                !roomCode.trim() ||
                !password.trim()
              }
              onClick={joinRoom}
            >
              {loading ? "입장 확인 중…" : "입장하기"}
            </button>
            {notice ? <small className="privacy-copy">{notice}</small> : null}
            <small className="privacy-copy">
              다른 학생의 답변과 분석 결과는 볼 수 없습니다.
            </small>
          </section>
        ) : null}

        {phase === "waiting" ? (
          <section className="student-card waiting-card">
            <div className="pulse-orbit">
              <span />
            </div>
            <span className="eyebrow">YOU&apos;RE IN</span>
            <h1>{name || "학생"}님, 입장했습니다</h1>
            <p>교사가 질문을 공개할 때까지 이 화면에서 기다려 주세요.</p>
            <div className="room-summary">
              <span>현재 입장</span>
              <strong>{participantCount}명</strong>
            </div>
          </section>
        ) : null}

        {phase === "answer" ? (
          <section className="student-card answer-card">
            <div className="question-label">
              <span>오늘의 질문</span>
              <small>최대 500자</small>
            </div>
            <h1>{room?.question ?? "교사의 질문을 불러오는 중입니다."}</h1>
            <textarea
              rows={8}
              placeholder="예: 급식실에서 버려지는 음식이 많아서, 학생이 먹을 양을 미리 선택하는 서비스를 만들고 싶어요."
              maxLength={500}
              value={answer}
              onChange={(event) => {
                const nextAnswer = event.target.value;
                setAnswer(nextAnswer);
                window.sessionStorage.setItem(
                  answerDraftKey(roomCode),
                  nextAnswer,
                );
              }}
            />
            <div className="answer-meta">
              <span>{answer.length} / 500자</span>
            </div>
            <button
              className="button primary full"
              disabled={loading}
              onClick={submitAnswer}
            >
              {loading ? "저장 중…" : "답변 제출"}
            </button>
            {notice ? <small className="privacy-copy">{notice}</small> : null}
          </section>
        ) : null}

        {phase === "submitted" ? (
          <section className="student-card">
            <div className="success-mark">✓</div>
            <span className="eyebrow">RESPONSE SAVED</span>
            <h1>답변을 제출했습니다</h1>
            <p>교사가 응답을 마감하고 팀 구성을 확정하면 결과를 확인할 수 있습니다.</p>
            <div className="submitted-preview">
              <span>내가 제출한 답변</span>
              <p>{answer || "빈 답변으로 제출했습니다."}</p>
            </div>
          </section>
        ) : null}

        {phase === "result" ? (
          <section className="student-card result-card">
            {teamResult ? (
              <>
                <span className="team-number">
                  TEAM {String(teamResult.number).padStart(2, "0")}
                </span>
                <h1>
                  {teamResult.name}
                  {teamResult.representativeIdea
                    ? ` · ${teamResult.representativeIdea}`
                    : ""}
                </h1>
                {teamResult.commonTopic ? (
                  <p className="team-topic">{teamResult.commonTopic}</p>
                ) : null}
                <div className="result-members">
                  {teamResult.members.map((member, index) => (
                    <div key={`${member.number}-${member.name}-${index}`}>
                      <span>{member.name.slice(-1)}</span>
                      <strong>
                        {member.number
                          ? `${member.number} ${member.name}`
                          : member.name}
                      </strong>
                      {member.isMe ? <small>나</small> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="pulse-orbit">
                  <span />
                </div>
                <span className="eyebrow">TEAM RESULT</span>
                <h1>팀 결과를 불러오는 중입니다</h1>
                <p>교사가 팀 구성을 확정하면 이 화면에 표시됩니다.</p>
              </>
            )}
            {notice ? <small className="privacy-copy">{notice}</small> : null}
            <div className="student-info-note">
              팀 구성 점수나 다른 학생의 원본 답변은 공개되지 않습니다.
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
