"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";

type StudentPhase = "join" | "waiting" | "answer" | "submitted" | "result";

export function StudentWorkspace({
  initialRoomCode = "",
}: {
  initialRoomCode?: string;
}) {
  const [phase, setPhase] = useState<StudentPhase>("join");
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [password, setPassword] = useState("class24");
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

  useEffect(() => {
    if (phase === "join") return;

    let cancelled = false;
    async function refreshRoom() {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          participantCount: number;
          room: {
            subject: string;
            title: string;
            className: string | null;
            question: string;
            phase: string;
          };
        };
        if (cancelled) return;
        setParticipantCount(data.participantCount);
        setRoom(data.room);
        if (data.room.phase === "collecting" && phase === "waiting") {
          setPhase("answer");
        }
        if (data.room.phase === "completed") {
          setPhase("result");
        }
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
  }, [phase, roomCode]);

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
            <p>교사가 공유한 룸 코드와 참여 암호를 입력합니다.</p>
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
              <small>화면은 자동으로 갱신됩니다.</small>
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
            <p>짧더라도 자신의 관심 주제와 방향이 드러나면 충분합니다.</p>
            <textarea
              rows={8}
              placeholder="예: 급식실에서 버려지는 음식이 많아서, 학생이 먹을 양을 미리 선택하는 서비스를 만들고 싶어요."
              maxLength={500}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
            />
            <div className="answer-meta">
              <span>{answer.length} / 500자</span>
              <span>빈 답변도 제출할 수 있습니다.</span>
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
            <span className="team-number">TEAM 01</span>
            <h1>1조 · 급식 잔반 줄이기</h1>
            <p className="team-topic">
              학생 선택형 배식과 만족도 조사를 활용한 학교 급식 잔반 감소 프로젝트
            </p>
            <div className="result-members">
              {["김민서", "이서준", "박지우", name || "나"].map(
                (member, index) => (
                  <div key={`${member}-${index}`}>
                    <span>{member.slice(-1)}</span>
                    <strong>{member}</strong>
                    {index === 3 ? <small>나</small> : null}
                  </div>
                ),
              )}
            </div>
            <div className="student-info-note">
              팀 구성 점수나 다른 학생의 원본 답변은 공개되지 않습니다.
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
