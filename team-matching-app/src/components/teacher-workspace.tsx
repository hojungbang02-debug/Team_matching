"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { AppHeader } from "@/components/app-header";
import { defaultRubric } from "@/lib/matching-defaults";
import type {
  Criterion,
  MatchResult,
  ParticipantInput,
  RoomConfig,
  RoomPhase,
  TeamResult,
} from "@/lib/types";

const phaseOrder: RoomPhase[] = [
  "setup",
  "waiting",
  "collecting",
  "analyzing",
  "review",
  "completed",
];

const phaseLabels: Record<RoomPhase, string> = {
  setup: "룸 설정",
  waiting: "입장",
  collecting: "응답",
  analyzing: "분석",
  review: "검토",
  completed: "확정",
};

const initialConfig: RoomConfig = {
  subject: "",
  title: "",
  className: "",
  question: "",
  expectedCount: undefined,
  teamMode: "auto",
  targetTeamSize: 4,
  recommendedMax: 5,
  hardMax: 6,
  password: "",
  rubric: defaultRubric,
};

const TEACHER_STATE_KEY = "team-matching-teacher-state";

type TeacherRoomSnapshot = {
  room: {
    code: string;
    subject: string;
    title: string;
    className: string | null;
    question: string;
    phase: string;
    expectedCount: number | null;
    teamMode: "auto" | "fixed";
    fixedTeamCount: number | null;
    targetTeamSize: number;
    recommendedMax: number;
    hardMax: number;
    rubric: Criterion[];
    rubricSource: "gemini" | "teacher" | "demo-fallback";
  };
  participants?: ParticipantInput[];
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
  description,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "blue";
  description?: string;
}) {
  return (
    <article className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {description ? <small>{description}</small> : null}
    </article>
  );
}

export function TeacherWorkspace() {
  const [phase, setPhase] = useState<RoomPhase>("setup");
  const [config, setConfig] = useState<RoomConfig>(initialConfig);
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);
  const [rubricSource, setRubricSource] = useState<"default" | "gemini">(
    "default",
  );
  const [rubricLoading, setRubricLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [approvals, setApprovals] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [stateRestored, setStateRestored] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const submitted = participants.filter(
    (participant) => participant.submitted,
  );
  const answered = participants.filter(
    (participant) => participant.answer.trim().length > 0,
  );
  const calculatedTeamCount = Math.max(
    1,
    config.teamMode === "fixed"
      ? config.fixedTeamCount || 1
      : Math.ceil(
          Math.max(participants.length, config.expectedCount || 1) /
            config.targetTeamSize,
        ),
  );
  const canConfirm = Boolean(
    matchResult &&
      matchResult.teams.every(
        (team) => team.members.length <= config.hardMax,
      ) &&
      matchResult.warnings
        .filter((warning) => warning.requiresApproval)
        .every((warning) => approvals.includes(warning.message)),
  );

  useEffect(() => {
    let cancelled = false;
    async function restoreState() {
      await Promise.resolve();
      if (cancelled) return;
      const searchParams = new URLSearchParams(window.location.search);
      const urlCode = searchParams.get("room")?.toUpperCase();
      const startFresh = searchParams.get("new") === "1";
      try {
        if (startFresh) {
          window.localStorage.removeItem(TEACHER_STATE_KEY);
          return;
        }
        const saved = window.localStorage.getItem(TEACHER_STATE_KEY);
        if (saved) {
          const snapshot = JSON.parse(saved) as {
            roomCode: string;
            phase: RoomPhase;
            config: RoomConfig;
            rubricSource: "default" | "gemini";
            matchResult: MatchResult | null;
            approvals: string[];
          };
          if (!urlCode || snapshot.roomCode === urlCode) {
            setRoomCode(snapshot.roomCode);
            setPhase(snapshot.phase);
            setConfig({ ...snapshot.config, password: "" });
            setRubricSource(snapshot.rubricSource);
            setMatchResult(snapshot.matchResult);
            setApprovals(snapshot.approvals);
          } else {
            setRoomCode(urlCode);
            setPhase("waiting");
          }
        } else if (urlCode) {
          setRoomCode(urlCode);
          setPhase("waiting");
        } else {
          const response = await fetch("/api/rooms/current", {
            cache: "no-store",
          });
          if (response.ok) {
            const data = (await response.json()) as { code: string };
            setRoomCode(data.code);
            setPhase("waiting");
            window.history.replaceState(
              null,
              "",
              `/teacher?room=${data.code}`,
            );
          }
        }
      } catch {
        window.localStorage.removeItem(TEACHER_STATE_KEY);
      } finally {
        setStateRestored(true);
      }
    }

    void restoreState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!stateRestored || !roomCode || phase === "setup") return;
    const compactResult = matchResult
      ? {
          ...matchResult,
          analyses: matchResult.analyses.map((analysis) => ({
            ...analysis,
            embedding: [],
          })),
        }
      : null;
    window.localStorage.setItem(
      TEACHER_STATE_KEY,
      JSON.stringify({
        roomCode,
        phase,
        config: { ...config, password: "" },
        rubricSource,
        matchResult: compactResult,
        approvals,
      }),
    );
  }, [
    approvals,
    config,
    matchResult,
    phase,
    roomCode,
    rubricSource,
    stateRestored,
  ]);

  useEffect(() => {
    if (!roomCode || phase === "setup") return;

    let cancelled = false;
    async function refreshRoom() {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`, {
          cache: "no-store",
        });
        if (response.status === 401) {
          window.localStorage.removeItem(TEACHER_STATE_KEY);
          window.history.replaceState(null, "", "/teacher");
          setRoomCode(null);
          setPhase("setup");
          setNotice("교사 세션이 만료되었습니다. 새 룸을 만들어 주세요.");
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as TeacherRoomSnapshot;
        if (cancelled) return;
        if (data.participants) setParticipants(data.participants);
        setConfig((current) => ({
          subject: data.room.subject,
          title: data.room.title,
          className: data.room.className ?? "",
          question: data.room.question,
          expectedCount: data.room.expectedCount ?? undefined,
          teamMode: data.room.teamMode,
          fixedTeamCount: data.room.fixedTeamCount ?? undefined,
          targetTeamSize: data.room.targetTeamSize,
          recommendedMax: data.room.recommendedMax,
          hardMax: data.room.hardMax,
          password: current.password,
          rubric: data.room.rubric.length
            ? data.room.rubric
            : current.rubric,
        }));
        setRubricSource(
          data.room.rubricSource === "gemini" ? "gemini" : "default",
        );
        const restoredPhase: RoomPhase =
          data.room.phase === "waiting"
            ? "waiting"
            : data.room.phase === "collecting"
              ? "collecting"
              : data.room.phase === "review"
                ? matchResult
                  ? "review"
                  : "analyzing"
                : data.room.phase === "completed"
                  ? matchResult
                    ? "completed"
                    : "analyzing"
                  : "analyzing";
        setPhase(restoredPhase);
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
  }, [matchResult, roomCode, phase]);

  async function suggestRubric() {
    setRubricLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/rubric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: config.subject,
          title: config.title,
          question: config.question,
        }),
      });
      if (!response.ok) throw new Error("기준 생성 실패");
      const data = (await response.json()) as {
        criteria: Criterion[];
        source: "gemini" | "demo-fallback";
        clarificationQuestion?: string | null;
      };
      setConfig((current) => ({ ...current, rubric: data.criteria }));
      setRubricSource(data.source === "gemini" ? "gemini" : "default");
      setNotice(
        data.source === "gemini"
          ? "교사의 질문을 바탕으로 AI가 매칭 기준을 제안했습니다."
          : data.clarificationQuestion ||
              "기본 매칭 기준을 불러왔습니다. 내용을 확인해 주세요.",
      );
    } catch {
      setNotice("AI 연결에 실패해 기본 기준을 유지합니다.");
    } finally {
      setRubricLoading(false);
    }
  }

  async function createRoom() {
    setNotice(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          rubricSource:
            rubricSource === "gemini" ? "gemini" : "teacher",
        }),
      });
      const data = (await response.json()) as {
        code?: string;
        error?: string;
      };
      if (!response.ok || !data.code) {
        throw new Error(data.error || "룸 생성 실패");
      }
      setRoomCode(data.code);
      setPhase("waiting");
      window.history.replaceState(
        null,
        "",
        `/teacher?room=${data.code}`,
      );
      setNotice(
        `룸 ${data.code}가 생성되었습니다. 링크를 공유하고 학생 입장을 기다려 주세요.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "룸 생성에 실패했습니다.",
      );
    }
  }

  function startNewRoom() {
    const confirmed = window.confirm(
      "새 룸을 만들까요? 기존 룸 데이터는 삭제되지 않습니다.",
    );
    if (!confirmed) return;

    window.localStorage.removeItem(TEACHER_STATE_KEY);
    window.history.replaceState(null, "", "/teacher?new=1");
    setRoomCode(null);
    setPhase("setup");
    setConfig(initialConfig);
    setParticipants([]);
    setRubricSource("default");
    setMatchResult(null);
    setApprovals([]);
    setNotice(null);
    setQrDataUrl(null);
    setQrOpen(false);
  }

  async function copyJoinLink() {
    if (!roomCode) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}/student?room=${roomCode}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function showJoinQr() {
    if (!roomCode) return;
    const joinLink = `${window.location.origin}/student?room=${roomCode}`;
    const dataUrl = await QRCode.toDataURL(joinLink, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#172033",
        light: "#ffffff",
      },
    });
    setQrDataUrl(dataUrl);
    setQrOpen(true);
  }

  async function saveRoomPhase(
    databasePhase:
      | "collecting"
      | "locked"
      | "analyzing"
      | "review"
      | "completed",
  ) {
    if (!roomCode) throw new Error("생성된 룸이 없습니다.");
    const response = await fetch(`/api/rooms/${roomCode}/phase`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: databasePhase }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error || "진행 단계 저장 실패");
    }
  }

  async function openQuestion() {
    try {
      await saveRoomPhase("collecting");
      setPhase("collecting");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "질문 공개 실패");
    }
  }

  async function closeResponses() {
    try {
      await saveRoomPhase("locked");
      setPhase("analyzing");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "응답 마감 실패");
    }
  }

  async function returnToAnalysis() {
    try {
      await saveRoomPhase("analyzing");
      setPhase("analyzing");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "단계 변경 실패");
    }
  }

  async function completeMatching() {
    try {
      await saveRoomPhase("completed");
      setPhase("completed");
      setNotice("팀 구성을 확정했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "팀 확정 실패");
    }
  }

  async function runMatching() {
    setMatchLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: config.question,
          rubric: config.rubric,
          participants,
          roomCode: roomCode ?? undefined,
          requestedTeamCount:
            config.teamMode === "fixed"
              ? config.fixedTeamCount || calculatedTeamCount
              : Math.ceil(participants.length / config.targetTeamSize),
          hardMax: config.hardMax,
        }),
      });
      if (!response.ok) throw new Error("팀 구성 실패");
      const data = (await response.json()) as MatchResult;
      if (roomCode) await saveRoomPhase("review");
      setMatchResult(data);
      setApprovals([]);
      setPhase("review");
      setNotice(
        data.source === "gemini"
          ? "Gemini 분석과 임베딩을 사용해 팀 추천안을 만들었습니다."
          : "AI 호출을 사용할 수 없어 기본 분석으로 추천안을 만들었습니다.",
      );
    } catch {
      setNotice("팀 구성 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setMatchLoading(false);
    }
  }

  function moveMember(participantId: string, destinationId: string) {
    if (!matchResult) return;
    const nextTeams = matchResult.teams.map((team) => ({
      ...team,
      members: [...team.members],
    }));
    let movedMember: TeamResult["members"][number] | undefined;
    for (const team of nextTeams) {
      const index = team.members.findIndex(
        (member) => member.participantId === participantId,
      );
      if (index >= 0) {
        [movedMember] = team.members.splice(index, 1);
      }
    }
    const destination = nextTeams.find((team) => team.id === destinationId);
    if (movedMember && destination) {
      destination.members.push({ ...movedMember, matchingMethod: "balanced" });
    }
    setMatchResult({ ...matchResult, teams: nextTeams });
  }

  const participantMap = useMemo(
    () =>
      new Map(
        participants.map((participant) => [participant.id, participant]),
      ),
    [participants],
  );

  return (
    <div className="app-shell">
      <AppHeader
        role="교사"
        title={config.title}
        subtitle={
          phase === "setup"
            ? "새로운 수업 룸"
            : `${config.className} · ${roomCode ?? "룸 생성 중"}`
        }
      />
      <div className="workspace">
        <aside className="step-sidebar">
          <div className="sidebar-title">
            <span>진행 단계</span>
            <b>{phaseLabels[phase]}</b>
          </div>
          <ol>
            {phaseOrder.map((item, index) => {
              const currentIndex = phaseOrder.indexOf(phase);
              const state =
                index < currentIndex
                  ? "done"
                  : index === currentIndex
                    ? "active"
                    : "pending";
              return (
                <li key={item} className={state}>
                  <span>{state === "done" ? "✓" : index + 1}</span>
                  <div>
                    <strong>{phaseLabels[item]}</strong>
                  </div>
                </li>
              );
            })}
          </ol>
          {phase !== "setup" ? (
            <button className="new-room-button" onClick={startNewRoom}>
              ＋ 새 룸 만들기
            </button>
          ) : null}
        </aside>

        <main className="workspace-main">
          {phase !== "setup" ? (
            <div className="mobile-room-actions">
              <button className="button secondary" onClick={startNewRoom}>
                ＋ 새 룸 만들기
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="notice-bar">
              <span>{notice}</span>
              <button onClick={() => setNotice(null)} aria-label="알림 닫기">
                ×
              </button>
            </div>
          ) : null}

          {phase === "setup" ? (
            <section className="panel setup-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ROOM SETUP</span>
                  <h1>아이디어 팀 매칭 룸 만들기</h1>
                </div>
              </div>

              <div className="section-block">
                <div className="section-title">
                  <span>01</span>
                  <div>
                    <h2>수업 정보</h2>
                  </div>
                </div>
                <div className="form-grid two">
                  <Field label="과목명">
                    <input
                      placeholder="예: 통합과학"
                      value={config.subject}
                      onChange={(event) =>
                        setConfig({ ...config, subject: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="수업·반">
                    <input
                      placeholder="예: 2학년 3반"
                      value={config.className}
                      onChange={(event) =>
                        setConfig({ ...config, className: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="과제명">
                    <input
                      placeholder="예: 우리 학교를 바꾸는 아이디어"
                      value={config.title}
                      onChange={(event) =>
                        setConfig({ ...config, title: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="예상 학생 수">
                    <input
                      type="number"
                      min={1}
                      placeholder="예: 30"
                      value={config.expectedCount || ""}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          expectedCount: Number(event.target.value) || undefined,
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="학생에게 제시할 자유 주제 질문">
                  <textarea
                    rows={4}
                    placeholder="예: 학교생활에서 해결하고 싶은 문제와 해결 아이디어를 적어주세요."
                    value={config.question}
                    onChange={(event) =>
                      setConfig({ ...config, question: event.target.value })
                    }
                  />
                </Field>
              </div>

              <div className="section-block">
                <div className="section-title with-action">
                  <span>02</span>
                  <div>
                    <h2>질문별 매칭 기준</h2>
                  </div>
                  <button
                    className="button soft"
                    onClick={suggestRubric}
                    disabled={rubricLoading || !config.question.trim()}
                  >
                    {rubricLoading ? "기준 분석 중…" : "✦ AI 기준 제안"}
                  </button>
                </div>
                <div className="rubric-grid">
                  {config.rubric.map((criterion, index) => (
                    <article className="rubric-card" key={criterion.key}>
                      <div>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{criterion.label}</strong>
                      </div>
                      <p>{criterion.description}</p>
                      <label>
                        중요도
                        <input
                          type="number"
                          min={5}
                          max={70}
                          value={Math.round(criterion.weight * 100)}
                          onChange={(event) => {
                            const next = [...config.rubric];
                            next[index] = {
                              ...criterion,
                              weight: Number(event.target.value) / 100,
                            };
                            setConfig({ ...config, rubric: next });
                          }}
                        />
                        %
                      </label>
                    </article>
                  ))}
                </div>
                <p className="inline-help">
                  {rubricSource === "gemini" ? "● AI 제안 기준" : "● 기본 기준"}
                </p>
              </div>

              <div className="section-block">
                <div className="section-title">
                  <span>03</span>
                  <div>
                    <h2>팀과 입장 정책</h2>
                  </div>
                </div>
                <div className="segmented">
                  <button
                    className={config.teamMode === "auto" ? "active" : ""}
                    onClick={() => setConfig({ ...config, teamMode: "auto" })}
                  >
                    목표 인원으로 자동 계산
                  </button>
                  <button
                    className={config.teamMode === "fixed" ? "active" : ""}
                    onClick={() => setConfig({ ...config, teamMode: "fixed" })}
                  >
                    팀 수 고정
                  </button>
                </div>
                <div className="form-grid four">
                  {config.teamMode === "fixed" ? (
                    <Field label="고정 팀 수">
                      <input
                        type="number"
                        min={1}
                        value={config.fixedTeamCount || 6}
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            fixedTeamCount: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  ) : (
                    <Field label="목표 팀원 수">
                      <input
                        type="number"
                        min={2}
                        value={config.targetTeamSize}
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            targetTeamSize: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  )}
                  <Field label="권장 최대">
                    <input
                      type="number"
                      min={2}
                      value={config.recommendedMax}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          recommendedMax: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="절대 최대">
                    <input
                      type="number"
                      min={2}
                      value={config.hardMax}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          hardMax: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="참여 암호">
                    <input
                      placeholder="예: class24"
                      value={config.password}
                      onChange={(event) =>
                        setConfig({ ...config, password: event.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>

              <div className="panel-footer">
                <button
                  className="button primary"
                  onClick={createRoom}
                  disabled={
                    !config.subject.trim() ||
                    !config.title.trim() ||
                    !config.question.trim() ||
                    !config.password.trim()
                  }
                >
                  룸 생성하기 →
                </button>
              </div>
            </section>
          ) : null}

          {phase === "waiting" || phase === "collecting" ? (
            <section className="dashboard-stack">
              <div className="room-banner">
                <div>
                  <span className="live-dot" />
                  <strong>
                    {phase === "waiting" ? "학생 입장 대기 중" : "응답 수집 중"}
                  </strong>
                  <p>{config.question}</p>
                </div>
                <div className="join-code">
                  <span>룸 코드</span>
                  <b>{roomCode ?? "------"}</b>
                  <div className="join-actions">
                    <button onClick={copyJoinLink}>
                      {copied ? "복사됨 ✓" : "링크 복사"}
                    </button>
                    <button onClick={showJoinQr}>QR 보기</button>
                  </div>
                </div>
              </div>

              <div className="stat-grid">
                <StatCard
                  label="현재 입장"
                  value={`${participants.length}명`}
                  tone="blue"
                  description={`예상 ${config.expectedCount ?? "미설정"}명`}
                />
                <StatCard
                  label="답변 제출"
                  value={`${submitted.length}명`}
                  tone="good"
                />
                <StatCard
                  label="미제출"
                  value={`${Math.max(0, participants.length - submitted.length)}명`}
                  tone="warn"
                />
                <StatCard
                  label="예상 팀"
                  value={`${calculatedTeamCount}팀`}
                  description={`목표 ${config.targetTeamSize}명`}
                />
              </div>

              <section className="panel compact-panel">
                <div className="panel-heading inline">
                  <div>
                    <span className="eyebrow">LIVE ROSTER</span>
                    <h2>학생 참여 현황</h2>
                  </div>
                </div>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${
                        participants.length
                          ? (submitted.length / participants.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                {participants.length ? (
                  <div className="participant-table">
                    <div className="table-row table-head">
                      <span>번호</span>
                      <span>이름</span>
                      <span>답변</span>
                      <span>상태</span>
                    </div>
                    {participants.slice(0, 10).map((participant) => (
                      <div
                        className={`table-row ${
                          participant.submitted && !participant.answer
                            ? "attention"
                            : ""
                        }`}
                        key={participant.id}
                      >
                        <span>{participant.number}</span>
                        <strong>{participant.name}</strong>
                        <span>
                          {participant.answer
                            ? `${participant.answer.length}자`
                            : "—"}
                        </span>
                        <span
                          className={`status ${
                            participant.submitted ? "submitted" : "pending"
                          }`}
                        >
                          {participant.submitted
                            ? participant.answer
                              ? "제출"
                              : "빈 답변"
                            : "미제출"}
                        </span>
                      </div>
                    ))}
                    {participants.length > 10 ? (
                      <div className="table-more">
                        외 {participants.length - 10}명
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="empty-state">
                    <b>아직 입장한 학생이 없습니다.</b>
                    <p>학생 링크를 공유해 주세요.</p>
                  </div>
                )}
                <div className="action-bar">
                  <span>
                    {phase === "waiting"
                      ? "예상 인원과 달라도 교사가 질문을 공개할 수 있습니다."
                      : "미제출자는 수집 마감 시 매칭 정보 부족으로 처리합니다."}
                  </span>
                  {phase === "waiting" ? (
                    <button
                      className="button primary"
                      onClick={openQuestion}
                      disabled={!participants.length}
                    >
                      질문 공개
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      onClick={closeResponses}
                    >
                      수집 마감 및 명단 확정
                    </button>
                  )}
                </div>
              </section>
            </section>
          ) : null}

          {phase === "analyzing" ? (
            <section className="panel analysis-ready">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">SNAPSHOT LOCKED</span>
                  <h1>응답 분석을 시작할까요?</h1>
                </div>
                <span className="source-chip">Gemini + 임베딩</span>
              </div>
              <div className="stat-grid">
                <StatCard label="확정 인원" value={`${participants.length}명`} />
                <StatCard label="내용 있는 답변" value={`${answered.length}명`} tone="good" />
                <StatCard label="정보 확인 필요" value={`${participants.length - answered.length}명`} tone="warn" />
                <StatCard label="생성할 팀" value={`${Math.ceil(participants.length / config.targetTeamSize)}팀`} tone="blue" />
              </div>
              <div className="panel-footer">
                <button
                  className="button secondary"
                  onClick={openQuestion}
                >
                  응답 수집 다시 열기
                </button>
                <button
                  className="button primary"
                  disabled={matchLoading}
                  onClick={runMatching}
                >
                  {matchLoading ? "AI 분석 및 팀 구성 중…" : "AI 팀 구성 실행 →"}
                </button>
              </div>
            </section>
          ) : null}

          {phase === "review" && matchResult ? (
            <section className="dashboard-stack">
              <div className="review-heading">
                <div>
                  <span className="eyebrow">TEACHER REVIEW</span>
                  <h1>팀 추천안을 검토해 주세요</h1>
                </div>
                <span className={`source-chip ${matchResult.source}`}>
                  {matchResult.source === "gemini"
                    ? "Gemini 분석"
                    : "기본 분석"}
                </span>
              </div>
              <div className="stat-grid">
                <StatCard label="확정 대상" value={`${matchResult.summary.participantCount}명`} />
                <StatCard label="대표 Seed" value={`${matchResult.seeds.length}개`} tone="blue" />
                <StatCard label="매칭 정보 부족" value={`${matchResult.summary.insufficientCount}명`} tone="warn" />
                <StatCard label="평균 의미 유사도" value={matchResult.summary.averageSimilarity.toFixed(2)} tone="good" />
              </div>

              {matchResult.warnings.length ? (
                <div className="warning-list">
                  {matchResult.warnings.map((warning) => (
                    <label key={warning.message} className="warning-item">
                      <span className="warning-icon">!</span>
                      <div>
                        <strong>{warning.message}</strong>
                        <small>
                          {warning.requiresApproval
                            ? "확정하려면 교사 확인이 필요합니다."
                            : "학생 화면에는 이 사유가 표시되지 않습니다."}
                        </small>
                      </div>
                      {warning.requiresApproval ? (
                        <input
                          type="checkbox"
                          checked={approvals.includes(warning.message)}
                          onChange={(event) =>
                            setApprovals((current) =>
                              event.target.checked
                                ? [...current, warning.message]
                                : current.filter(
                                    (message) => message !== warning.message,
                                  ),
                            )
                          }
                          aria-label={`${warning.message} 승인`}
                        />
                      ) : (
                        <span className="auto-label">자동 처리</span>
                      )}
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="team-grid">
                {matchResult.teams.map((team, teamIndex) => {
                  const overRecommended =
                    team.members.length > config.recommendedMax;
                  const overHard = team.members.length > config.hardMax;
                  return (
                    <article
                      className={`team-card ${
                        overHard ? "danger" : overRecommended ? "warn" : ""
                      }`}
                      key={team.id}
                    >
                      <div className="team-card-head">
                        <div>
                          <span>TEAM {String(teamIndex + 1).padStart(2, "0")}</span>
                          <h2>{team.name}</h2>
                        </div>
                        <span className="capacity">
                          {team.members.length}/{team.targetCapacity}명
                        </span>
                      </div>
                      <div className="seed-box">
                        <span>대표 아이디어</span>
                        <strong>{team.representativeIdea}</strong>
                      </div>
                      <div className="member-list">
                        {team.members.map((member) => {
                          const participant = participantMap.get(
                            member.participantId,
                          );
                          const isSeed =
                            team.seedParticipantId === member.participantId;
                          return (
                            <div className="member-row" key={member.participantId}>
                              <span className={`avatar avatar-${teamIndex % 4}`}>
                                {participant?.name.slice(-1)}
                              </span>
                              <div>
                                <strong>
                                  {participant?.number} {participant?.name}
                                </strong>
                                <small>
                                  {isSeed
                                    ? "Seed 학생"
                                    : member.matchingMethod === "balanced"
                                      ? "인원 균형 배정"
                                      : `의미 유사도 ${(
                                          member.similarity ?? 0
                                        ).toFixed(2)}`}
                                </small>
                              </div>
                              <select
                                value={team.id}
                                onChange={(event) =>
                                  moveMember(
                                    member.participantId,
                                    event.target.value,
                                  )
                                }
                                aria-label={`${participant?.name} 학생 팀 이동`}
                              >
                                {matchResult.teams.map((target) => (
                                  <option key={target.id} value={target.id}>
                                    {target.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                      <div className="team-reason">
                        <span>공통 주제</span>
                        <p>{team.commonTopic}</p>
                      </div>
                      {overRecommended ? (
                        <p className={`capacity-warning ${overHard ? "hard" : ""}`}>
                          {overHard
                            ? `절대 최대 ${config.hardMax}명을 초과했습니다.`
                            : `권장 최대 ${config.recommendedMax}명을 초과했습니다.`}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              <div className="sticky-action">
                <div>
                  <strong>최종 확인</strong>
                  <span>
                    {canConfirm
                      ? "필수 경고를 모두 확인했습니다."
                      : "필수 경고의 승인 체크를 완료해 주세요."}
                  </span>
                </div>
                <button
                  className="button secondary"
                  onClick={returnToAnalysis}
                >
                  다시 분석
                </button>
                <button
                  className="button primary"
                  disabled={!canConfirm}
                  onClick={completeMatching}
                >
                  팀 구성 확정
                </button>
              </div>
            </section>
          ) : null}

          {phase === "completed" && matchResult ? (
            <section className="panel completion-panel">
              <div className="success-mark">✓</div>
              <span className="eyebrow">MATCHING COMPLETE</span>
              <h1>{matchResult.summary.teamCount}개 팀 구성이 확정되었습니다</h1>
              <div className="completion-grid">
                {matchResult.teams.map((team) => (
                  <article key={team.id}>
                    <span>{team.name}</span>
                    <strong>{team.representativeIdea}</strong>
                    <p>
                      {team.members
                        .map(
                          (member) =>
                            participantMap.get(member.participantId)?.name,
                        )
                        .join(" · ")}
                    </p>
                  </article>
                ))}
              </div>
              <div className="panel-footer center">
                <button className="button secondary" onClick={copyJoinLink}>
                  학생 결과 링크 복사
                </button>
                <button
                  className="button primary"
                  onClick={() => setNotice("학생 결과가 공개되었습니다.")}
                >
                  학생에게 결과 공개
                </button>
              </div>
            </section>
          ) : null}
        </main>
      </div>
      {qrOpen ? (
        <div
          className="qr-backdrop"
          role="presentation"
          onClick={() => setQrOpen(false)}
        >
          <section
            className="qr-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="qr-close"
              onClick={() => setQrOpen(false)}
              aria-label="QR 닫기"
            >
              ×
            </button>
            <span className="eyebrow">STUDENT JOIN</span>
            <h2 id="qr-dialog-title">학생 입장 QR</h2>
            {qrDataUrl ? (
              <Image
                className="qr-image"
                src={qrDataUrl}
                alt={`${roomCode} 학생 입장 QR 코드`}
                width={360}
                height={360}
                unoptimized
              />
            ) : null}
            <b className="qr-room-code">{roomCode}</b>
            <p>참여 암호는 학생에게 별도로 안내해 주세요.</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
