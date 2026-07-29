export type RoomPhase =
  | "setup"
  | "waiting"
  | "collecting"
  | "analyzing"
  | "review"
  | "completed";

export type Criterion = {
  key: string;
  label: string;
  description: string;
  weight: number;
};

export type RoomConfig = {
  subject: string;
  title: string;
  className: string;
  question: string;
  expectedCount?: number;
  teamMode: "auto" | "fixed";
  fixedTeamCount?: number;
  targetTeamSize: number;
  recommendedMax: number;
  hardMax: number;
  password: string;
  rubric: Criterion[];
};

export type ParticipantInput = {
  id: string;
  number: string;
  name: string;
  answer: string;
  submitted: boolean;
  submittedAt?: string;
};

export type AnalysisField = {
  key: string;
  label: string;
  value: string | null;
  level: number;
};

export type AnalyzedResponse = {
  participantId: string;
  fields: AnalysisField[];
  informationScore: number;
  isEmpty: boolean;
  isOffTopic: boolean;
  hasMatchingInformation: boolean;
  reason: string;
  embedding: number[];
};

export type SeedResult = {
  participantId: string;
  informationScore: number;
  diversityScore: number;
  supportScore: number;
  seedScore: number;
  thresholdUsed: number;
};

export type TeamMember = {
  participantId: string;
  similarity: number | null;
  matchingInformationScore: number;
  /** teacher = 교사 수동 배정 또는 학생 직접 선택 */
  matchingMethod: "seed" | "semantic" | "balanced" | "teacher";
};

export type TeamResult = {
  id: string;
  name: string;
  seedParticipantId: string | null;
  representativeIdea: string;
  commonTopic: string;
  reason: string;
  targetCapacity: number;
  members: TeamMember[];
};

export type MatchWarning = {
  code:
    | "SEED_SHORTAGE"
    | "LOW_INFORMATION"
    | "CAPACITY"
    | "LOW_SIMILARITY"
    | "FALLBACK"
    | "UNASSIGNED";
  message: string;
  requiresApproval: boolean;
};

export type MatchResult = {
  runId?: string;
  analyses: AnalyzedResponse[];
  seeds: SeedResult[];
  teams: TeamResult[];
  /** 답변이 없거나 주제를 벗어나 자동 배정하지 않은 학생. 학생이 직접 조를 고릅니다. */
  pendingParticipantIds: string[];
  warnings: MatchWarning[];
  summary: {
    participantCount: number;
    validCount: number;
    insufficientCount: number;
    teamCount: number;
    averageInformationScore: number;
    averageSimilarity: number;
  };
  source: "gemini" | "demo-fallback";
};
