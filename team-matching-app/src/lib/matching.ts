import type {
  AnalyzedResponse,
  MatchResult,
  MatchWarning,
  ParticipantInput,
  SeedResult,
  TeamResult,
} from "@/lib/types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Supabase `response_analyses.embedding`이 vector(1536)이므로 임베딩 차원을 고정합니다. */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * 팀 배정에 쓸 수 있는 응답인지 판단합니다.
 * 답변이 있고 주제에서 벗어나지 않았다면 임베딩으로 의미 배정을 할 수 있습니다.
 */
export function isMatchableAnalysis(analysis: AnalyzedResponse): boolean {
  return (
    !analysis.isEmpty &&
    !analysis.isOffTopic &&
    analysis.embedding.length > 0
  );
}

/**
 * 매칭 기준 항목 중 하나라도 뚜렷하게 드러나면 매칭 정보가 있다고 봅니다.
 * 짧게 쓴 답변이 전부 탈락하지 않도록 가중 평균과 개별 항목을 함께 확인합니다.
 */
export function hasEnoughMatchingInformation(
  informationScore: number,
  fields: { level: number }[],
): boolean {
  return (
    informationScore >= 0.2 || fields.some((field) => field.level >= 2)
  );
}

export function canFormNonEmptyTeams(
  participantCount: number,
  teamCount: number,
): boolean {
  return (
    Number.isInteger(participantCount) &&
    Number.isInteger(teamCount) &&
    participantCount > 0 &&
    teamCount > 0 &&
    teamCount <= participantCount
  );
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return clamp01(dot / (Math.sqrt(normA) * Math.sqrt(normB)));
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicVector(text: string, dimensions = 96): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return vector;
  const words = normalized.split(" ");
  const tokens = [...words];
  for (const word of words) {
    if (word.length >= 2) {
      for (let index = 0; index < word.length - 1; index += 1) {
        tokens.push(word.slice(index, index + 2));
      }
    }
  }
  for (const token of tokens) {
    const hash = stableHash(token);
    vector[hash % dimensions] += 1 + Math.min(token.length, 8) / 8;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm ? vector.map((value) => value / norm) : vector;
}

/**
 * 팀 수를 그대로 유지한 채 인원을 앞 팀부터 한 명씩 더 배분합니다.
 * 인원이 팀 수보다 적으면 뒤쪽 팀은 0이 됩니다.
 */
export function splitCapacities(total: number, teamCount: number): number[] {
  if (teamCount <= 0) return [];
  const base = Math.floor(Math.max(0, total) / teamCount);
  const remainder = Math.max(0, total) % teamCount;
  return Array.from(
    { length: teamCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

export function balancedCapacities(
  participantCount: number,
  teamCount: number,
): number[] {
  const safeTeamCount = Math.max(1, Math.min(teamCount, participantCount || 1));
  const base = Math.floor(participantCount / safeTeamCount);
  const remainder = participantCount % safeTeamCount;
  return Array.from(
    { length: safeTeamCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

/**
 * Seed 점수 가중치입니다.
 * 분석 모델의 정보량 점수는 대부분의 성실한 답변에서 1.0 근처로 몰려 변별력이 낮고,
 * 다양성 점수는 0~1 전 구간에 퍼집니다. 정보량을 더 크게 잡으면 거의 같은 주제의 답변이
 * 연달아 대표로 뽑혀 팀 주제가 겹치므로 다양성에 더 큰 가중치를 둡니다.
 */
const SEED_INFORMATION_WEIGHT = 0.3;
const SEED_DIVERSITY_WEIGHT = 0.55;
const SEED_SUPPORT_WEIGHT = 0.15;

function supportScore(
  candidate: AnalyzedResponse,
  valid: AnalyzedResponse[],
  threshold: number,
): number {
  const peers = valid.filter(
    (analysis) => analysis.participantId !== candidate.participantId,
  );
  if (!peers.length) return 0;
  const supporters = peers.filter(
    (analysis) =>
      cosineSimilarity(candidate.embedding, analysis.embedding) >= threshold,
  ).length;
  return supporters / peers.length;
}

export function selectDiverseSeeds(
  analyses: AnalyzedResponse[],
  requestedCount: number,
  supportThreshold = 0.6,
): { seeds: SeedResult[]; warnings: MatchWarning[] } {
  const valid = analyses.filter(isMatchableAnalysis);
  const warnings: MatchWarning[] = [];
  if (!valid.length) {
    return {
      seeds: [],
      warnings: [
        {
          code: "SEED_SHORTAGE",
          message: "대표 아이디어로 사용할 수 있는 응답이 없습니다.",
          requiresApproval: true,
        },
      ],
    };
  }

  // 정보량이 많은 응답을 먼저 대표로 쓰되, 팀 수를 채우지 못하면 기준을 단계적으로 낮춥니다.
  // 마지막 단계(0)에서는 답변이 있는 모든 응답이 후보가 되므로 빈 팀이 생기지 않습니다.
  const thresholds = [0.55, 0.45, 0.35, 0.25, 0.15, 0];
  let candidates: AnalyzedResponse[] = [];
  let thresholdUsed = thresholds.at(-1) ?? 0;
  for (const threshold of thresholds) {
    const nextCandidates = valid.filter(
      (analysis) => analysis.informationScore >= threshold,
    );
    candidates = nextCandidates;
    thresholdUsed = threshold;
    if (candidates.length >= requestedCount) break;
  }

  const targetCount = Math.min(requestedCount, candidates.length);
  const chosen: SeedResult[] = [];
  const first = [...candidates].sort(
    (a, b) =>
      b.informationScore - a.informationScore ||
      a.participantId.localeCompare(b.participantId),
  )[0];
  if (first) {
    const support = supportScore(first, valid, supportThreshold);
    chosen.push({
      participantId: first.participantId,
      informationScore: first.informationScore,
      diversityScore: 1,
      supportScore: support,
      seedScore:
        SEED_INFORMATION_WEIGHT * first.informationScore +
        SEED_DIVERSITY_WEIGHT +
        SEED_SUPPORT_WEIGHT * support,
      thresholdUsed,
    });
  }

  while (chosen.length < targetCount) {
    const remaining = candidates.filter(
      (candidate) =>
        !chosen.some((seed) => seed.participantId === candidate.participantId),
    );
    const scored = remaining.map((candidate) => {
      const maxSimilarity = Math.max(
        ...chosen.map((seed) => {
          const selected = valid.find(
            (analysis) => analysis.participantId === seed.participantId,
          );
          return selected
            ? cosineSimilarity(candidate.embedding, selected.embedding)
            : 0;
        }),
      );
      const diversity = 1 - maxSimilarity;
      const support = supportScore(candidate, valid, supportThreshold);
      return {
        participantId: candidate.participantId,
        informationScore: candidate.informationScore,
        diversityScore: diversity,
        supportScore: support,
        seedScore:
          SEED_INFORMATION_WEIGHT * candidate.informationScore +
          SEED_DIVERSITY_WEIGHT * diversity +
          SEED_SUPPORT_WEIGHT * support,
        thresholdUsed,
      };
    });
    scored.sort(
      (a, b) =>
        b.seedScore - a.seedScore ||
        b.informationScore - a.informationScore ||
        a.participantId.localeCompare(b.participantId),
    );
    if (!scored[0]) break;
    chosen.push(scored[0]);
  }

  if (chosen.length < requestedCount) {
    warnings.push({
      code: "SEED_SHORTAGE",
      message: `필요한 ${requestedCount}개 중 ${chosen.length}개의 대표 아이디어만 자동 선택했습니다.`,
      requiresApproval: true,
    });
  }
  if (thresholdUsed < 0.35) {
    warnings.push({
      code: "LOW_INFORMATION",
      message: `대표 아이디어가 부족해 Seed 기준을 ${thresholdUsed.toFixed(2)}까지 완화했습니다.`,
      requiresApproval: true,
    });
  }
  return { seeds: chosen, warnings };
}

function ideaText(analysis: AnalyzedResponse | undefined): string {
  if (!analysis) return "교사 지정 필요";
  const values = analysis.fields
    .map((field) => field.value)
    .filter((value): value is string => Boolean(value));
  return values.slice(0, 2).join(" · ") || "대표 아이디어";
}

export function buildMatchResult({
  participants,
  analyses,
  requestedTeamCount,
  hardMax,
  source,
}: {
  participants: ParticipantInput[];
  analyses: AnalyzedResponse[];
  requestedTeamCount: number;
  hardMax: number;
  source: MatchResult["source"];
}): MatchResult {
  const participantMap = new Map(
    participants.map((participant) => [participant.id, participant]),
  );
  const analysisMap = new Map(
    analyses.map((analysis) => [analysis.participantId, analysis]),
  );
  const activeCount = participants.length;
  const safeTeamCount = Math.max(
    1,
    Math.min(requestedTeamCount, activeCount || 1),
  );
  const capacities = balancedCapacities(activeCount, safeTeamCount);
  const seedSelection = selectDiverseSeeds(analyses, safeTeamCount);
  const warnings = [...seedSelection.warnings];

  // 답변한 학생만 의미 배정하고, 남는 자리는 직접 선택 대상 학생 몫으로 비워 둡니다.
  // 이렇게 해야 미배정 학생이 한 팀에 몰리지 않고 여러 팀에 고르게 흩어집니다.
  const matchableIds = new Set(
    analyses
      .filter(isMatchableAnalysis)
      .map((analysis) => analysis.participantId)
      .filter((id) => participantMap.has(id)),
  );
  const semanticCapacities = splitCapacities(matchableIds.size, safeTeamCount);

  const teams: TeamResult[] = capacities.map((capacity, index) => {
    const seed = seedSelection.seeds[index];
    const analysis = seed
      ? analysisMap.get(seed.participantId)
      : undefined;
    const participant = seed
      ? participantMap.get(seed.participantId)
      : undefined;
    return {
      id: `team-${index + 1}`,
      name: `${index + 1}조`,
      seedParticipantId: seed?.participantId ?? null,
      representativeIdea: ideaText(analysis),
      commonTopic: analysis
        ? `${ideaText(analysis)}을 중심으로 탐구하는 프로젝트`
        : "교사가 대표 주제를 지정해 주세요.",
      reason: participant
        ? `${participant.name} 학생의 아이디어를 대표로, 의미적으로 가까운 응답을 우선 배정했습니다.`
        : "자동 Seed가 부족해 인원 균형을 우선해 구성했습니다.",
      targetCapacity: capacity,
      members: seed
        ? [
            {
              participantId: seed.participantId,
              similarity: 1,
              matchingInformationScore: seed.informationScore,
              matchingMethod: "semantic",
            },
          ]
        : [],
    };
  });

  const seededIds = new Set(
    seedSelection.seeds.map((seed) => seed.participantId),
  );
  const validRemainder = analyses
    .filter(
      (analysis) =>
        !seededIds.has(analysis.participantId) &&
        isMatchableAnalysis(analysis),
    )
    .map((analysis) => {
      const scores = teams.map((team) => {
        const seedAnalysis = team.seedParticipantId
          ? analysisMap.get(team.seedParticipantId)
          : undefined;
        return seedAnalysis
          ? cosineSimilarity(analysis.embedding, seedAnalysis.embedding)
          : 0;
      });
      return { analysis, scores, priority: Math.max(...scores, 0) };
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.analysis.informationScore - a.analysis.informationScore ||
        a.analysis.participantId.localeCompare(b.analysis.participantId),
    );

  for (const item of validRemainder) {
    const preferences = teams
      .map((team, index) => ({ team, index, score: item.scores[index] }))
      .filter(({ team, index }) => team.members.length < semanticCapacities[index])
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.team.members.length - b.team.members.length ||
          a.index - b.index,
      );
    const selected = preferences[0];
    if (!selected) continue;
    selected.team.members.push({
      participantId: item.analysis.participantId,
      similarity: selected.score,
      matchingInformationScore: item.analysis.informationScore,
      matchingMethod: "semantic",
    });
  }

  const assigned = new Set(
    teams.flatMap((team) =>
      team.members.map((member) => member.participantId),
    ),
  );
  const unmatched = participants
    .filter((participant) => !assigned.has(participant.id))
    .sort(
      (a, b) =>
        stableHash(a.id) - stableHash(b.id) || a.id.localeCompare(b.id),
    );

  // 의미 배정된 학생이 한 명도 없으면 빈 팀만 남으므로 이때만 균형 배정합니다.
  const nothingMatched = assigned.size === 0;
  if (nothingMatched) {
    for (const participant of unmatched) {
      const selected =
        teams
          .filter((team) => team.members.length < team.targetCapacity)
          .sort(
            (a, b) =>
              a.members.length - b.members.length ||
              a.id.localeCompare(b.id),
          )[0] ?? teams[0];
      const analysis = analysisMap.get(participant.id);
      selected.members.push({
        participantId: participant.id,
        similarity: null,
        matchingInformationScore: analysis?.informationScore ?? 0,
        matchingMethod: "balanced",
      });
    }
    warnings.push({
      code: "FALLBACK",
      message: `분석할 수 있는 답변이 없어 ${unmatched.length}명을 인원 균형으로만 배정했습니다.`,
      requiresApproval: true,
    });
  }

  const pendingParticipantIds = nothingMatched
    ? []
    : unmatched.map((participant) => participant.id);
  if (pendingParticipantIds.length) {
    warnings.push({
      code: "UNASSIGNED",
      message: `답변이 없거나 주제를 벗어난 ${pendingParticipantIds.length}명은 자동 배정하지 않았습니다. 학생이 직접 조를 고르거나 교사가 지정해 주세요.`,
      requiresApproval: true,
    });
  }
  if (capacities.some((capacity) => capacity > hardMax)) {
    warnings.push({
      code: "CAPACITY",
      message: `현재 인원으로는 일부 팀이 절대 최대 인원 ${hardMax}명을 초과합니다.`,
      requiresApproval: true,
    });
  }

  const semanticMembers = teams.flatMap((team) =>
    team.members.filter(
      (member) =>
        member.matchingMethod === "semantic" &&
        member.similarity !== null &&
        member.similarity < 1,
    ),
  );
  const averageSimilarity = semanticMembers.length
    ? semanticMembers.reduce(
        (sum, member) => sum + (member.similarity ?? 0),
        0,
      ) / semanticMembers.length
    : 0;
  if (semanticMembers.some((member) => (member.similarity ?? 0) < 0.35)) {
    warnings.push({
      code: "LOW_SIMILARITY",
      message: "대표 아이디어와 의미 유사도가 낮은 배정이 포함되어 있습니다.",
      requiresApproval: true,
    });
  }

  const validCount = analyses.filter(
    (analysis) => analysis.hasMatchingInformation,
  ).length;
  return {
    analyses,
    seeds: seedSelection.seeds,
    teams,
    pendingParticipantIds,
    warnings,
    summary: {
      participantCount: activeCount,
      validCount,
      insufficientCount: activeCount - validCount,
      teamCount: safeTeamCount,
      averageInformationScore: analyses.length
        ? analyses.reduce(
            (sum, analysis) => sum + analysis.informationScore,
            0,
          ) / analyses.length
        : 0,
      averageSimilarity,
    },
    source,
  };
}
