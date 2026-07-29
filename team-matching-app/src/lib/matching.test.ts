import { describe, expect, it } from "vitest";
import {
  buildFallbackAnalyses,
  defaultRubric,
} from "./matching-defaults";
import { testParticipants } from "./matching.fixtures";
import {
  balancedCapacities,
  buildMatchResult,
  canFormNonEmptyTeams,
  cosineSimilarity,
  deterministicVector,
  hasEnoughMatchingInformation,
  selectDiverseSeeds,
} from "./matching";
import type { AnalyzedResponse, ParticipantInput } from "./types";

describe("matching utilities", () => {
  it("rejects a team count that would create empty teams", () => {
    expect(canFormNonEmptyTeams(10, 3)).toBe(true);
    expect(canFormNonEmptyTeams(2, 5)).toBe(false);
    expect(canFormNonEmptyTeams(0, 1)).toBe(false);
  });

  it("creates balanced capacities whose sum equals the participant count", () => {
    const capacities = balancedCapacities(23, 5);
    expect(capacities).toEqual([5, 5, 5, 4, 4]);
    expect(capacities.reduce((sum, value) => sum + value, 0)).toBe(23);
  });

  it("returns deterministic semantic vectors", () => {
    const first = deterministicVector("학교 급식 잔반 줄이기");
    const second = deterministicVector("학교 급식 잔반 줄이기");
    expect(first).toEqual(second);
    expect(cosineSimilarity(first, second)).toBeCloseTo(1);
  });

  it("selects distinct seeds and assigns every participant exactly once", () => {
    const analyses = buildFallbackAnalyses(testParticipants, defaultRubric);
    const seedSelection = selectDiverseSeeds(analyses, 3);
    expect(new Set(seedSelection.seeds.map((seed) => seed.participantId)).size).toBe(
      seedSelection.seeds.length,
    );

    const result = buildMatchResult({
      participants: testParticipants,
      analyses,
      requestedTeamCount: 3,
      hardMax: 3,
      source: "demo-fallback",
    });
    const assigned = result.teams.flatMap((team) =>
      team.members.map((member) => member.participantId),
    );
    expect(assigned).toHaveLength(testParticipants.length);
    expect(new Set(assigned).size).toBe(testParticipants.length);
  });

  it("splits a participant count that does not divide evenly", () => {
    expect(balancedCapacities(9, 3)).toEqual([3, 3, 3]);
    expect(balancedCapacities(10, 3)).toEqual([4, 3, 3]);
    expect(balancedCapacities(11, 3)).toEqual([4, 4, 3]);
  });

  it("keeps short but on-topic answers inside the matching pool", () => {
    // 항목 하나만 뚜렷해도 매칭 대상에 남아야 합니다.
    expect(hasEnoughMatchingInformation(0.275, [{ level: 2 }, { level: 0 }])).toBe(
      true,
    );
    expect(hasEnoughMatchingInformation(0, [{ level: 0 }, { level: 0 }])).toBe(
      false,
    );
  });

  it("gives every team a seed when answers can be embedded", () => {
    const analyses = buildFallbackAnalyses(testParticipants, defaultRubric);
    const result = buildMatchResult({
      participants: testParticipants,
      analyses,
      requestedTeamCount: 3,
      hardMax: 4,
      source: "demo-fallback",
    });
    expect(
      result.teams.every((team) => team.seedParticipantId !== null),
    ).toBe(true);
    expect(result.teams.every((team) => team.members.length > 0)).toBe(true);
    expect(
      result.warnings.some((warning) => warning.code === "SEED_SHORTAGE"),
    ).toBe(false);
  });

  it("does not pick two seeds from the same topic when information scores tie", () => {
    // 분석 모델은 성실한 답변 대부분에 정보량 1.0을 줍니다. 정보량을 다양성보다 크게
    // 잡으면 거의 같은 주제(유사도 0.9)인 두 명이 나란히 대표로 뽑혀 팀 주제가 겹칩니다.
    // 임베딩 기하를 직접 지정해 Seed 선택 규칙만 검증합니다.
    const rows: [string, number[], number][] = [
      ["a-cafeteria", [1, 0, 0], 1],
      ["b-cafeteria", [0.9, 0.4359, 0], 1],
      ["c-energy", [0.5, 0, 0.866], 0.7],
      ["d-energy", [0.45, 0, 0.893], 0.65],
    ];
    const analyses: AnalyzedResponse[] = rows.map(
      ([id, embedding, score]) => ({
        participantId: id,
        fields: [{ key: "topic", label: "문제 주제", value: id, level: 4 }],
        informationScore: score,
        isEmpty: false,
        isOffTopic: false,
        hasMatchingInformation: true,
        reason: "테스트",
        embedding,
      }),
    );

    const { seeds } = selectDiverseSeeds(analyses, 2);
    expect(seeds).toHaveLength(2);
    const picked = seeds.map((seed) => seed.participantId);
    expect(picked.filter((id) => id.endsWith("cafeteria"))).toHaveLength(1);
    expect(picked.filter((id) => id.endsWith("energy"))).toHaveLength(1);
  });

  it("leaves open slots for unanswered students instead of piling them into one team", () => {
    // 20명 5조. 16명은 4개 주제로 정상 답변하고 4명은 빈 답변/주제 이탈입니다.
    // 예전에는 의미 배정이 4개 팀을 정원까지 채워, 남은 4명이 한 팀에 몰렸습니다.
    const topics = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const participants: ParticipantInput[] = [];
    const analyses: AnalyzedResponse[] = [];
    for (let topic = 0; topic < 4; topic += 1) {
      for (let member = 0; member < 4; member += 1) {
        const id = `good-${topic}-${member}`;
        participants.push({
          id, number: String(participants.length + 1), name: id,
          answer: "정상 답변", submitted: true,
        });
        // 같은 주제끼리 아주 가깝고 다른 주제와는 멀도록 약간씩만 흔듭니다.
        const embedding = topics[topic].map(
          (value, index) => value * 10 + (index === (topic + 1) % 4 ? member * 0.1 : 0),
        );
        analyses.push({
          participantId: id,
          fields: [{ key: "topic", label: "문제 주제", value: id, level: 4 }],
          informationScore: 1 - member * 0.01,
          isEmpty: false, isOffTopic: false, hasMatchingInformation: true,
          reason: "정상", embedding,
        });
      }
    }
    for (let index = 0; index < 4; index += 1) {
      const id = `blank-${index}`;
      participants.push({
        id, number: String(participants.length + 1), name: id,
        answer: index < 2 ? "" : "ㅋㅋㅋ 축구하고 싶다", submitted: index >= 2,
      });
      analyses.push({
        participantId: id,
        fields: [{ key: "topic", label: "문제 주제", value: null, level: 0 }],
        informationScore: 0,
        isEmpty: index < 2, isOffTopic: index >= 2, hasMatchingInformation: false,
        reason: "정보 없음", embedding: [],
      });
    }

    const result = buildMatchResult({
      participants, analyses, requestedTeamCount: 5, hardMax: 5,
      source: "demo-fallback",
    });

    // 답변 없는 4명은 자동 배정되지 않습니다.
    expect(result.pendingParticipantIds.sort()).toEqual([
      "blank-0", "blank-1", "blank-2", "blank-3",
    ]);
    // 정원은 그대로 4명씩이고, 빈자리가 한 팀에 몰리지 않고 흩어집니다.
    expect(result.teams.map((team) => team.targetCapacity)).toEqual([4, 4, 4, 4, 4]);
    const openSlots = result.teams.map(
      (team) => team.targetCapacity - team.members.length,
    );
    expect(openSlots.reduce((sum, value) => sum + value, 0)).toBe(4);
    expect(Math.max(...openSlots)).toBeLessThanOrEqual(2);
    expect(
      result.warnings.some((warning) => warning.code === "UNASSIGNED"),
    ).toBe(true);
    expect(
      result.warnings.find((warning) => warning.code === "UNASSIGNED")
        ?.requiresApproval,
    ).toBe(true);
  });

  it("still fills teams when no answer can be analysed at all", () => {
    const participants: ParticipantInput[] = Array.from({ length: 6 }, (_, index) => ({
      id: `p-${index}`, number: String(index + 1), name: `학생${index}`,
      answer: "", submitted: false,
    }));
    const analyses: AnalyzedResponse[] = participants.map((participant) => ({
      participantId: participant.id,
      fields: [], informationScore: 0,
      isEmpty: true, isOffTopic: false, hasMatchingInformation: false,
      reason: "빈 답변", embedding: [],
    }));

    const result = buildMatchResult({
      participants, analyses, requestedTeamCount: 3, hardMax: 4,
      source: "demo-fallback",
    });
    const assigned = result.teams.flatMap((team) => team.members);
    expect(assigned).toHaveLength(6);
    expect(result.pendingParticipantIds).toHaveLength(0);
    expect(result.teams.every((team) => team.members.length === 2)).toBe(true);
  });

  it("assigns low-information answers semantically instead of by balance only", () => {
    const participants: ParticipantInput[] = [
      "급식 잔반이 많아 아깝습니다.",
      "급식 대기 줄이 너무 깁니다.",
      "교실 전등이 계속 켜져 있습니다.",
      "에어컨이 너무 세게 돌아갑니다.",
    ].map((answer, index) => ({
      id: `p-${index + 1}`,
      number: String(index + 1),
      name: `학생${index + 1}`,
      answer,
      submitted: true,
    }));
    // 매칭 기준 항목은 하나만 채워진, 정보량이 낮은 분석 결과를 흉내 냅니다.
    const analyses: AnalyzedResponse[] = participants.map((participant) => ({
      participantId: participant.id,
      fields: [
        { key: "topic", label: "문제 주제", value: participant.answer, level: 2 },
        { key: "goal", label: "원하는 변화", value: null, level: 0 },
      ],
      informationScore: 0.25,
      isEmpty: false,
      isOffTopic: false,
      hasMatchingInformation: true,
      reason: "테스트",
      embedding: deterministicVector(participant.answer),
    }));

    const result = buildMatchResult({
      participants,
      analyses,
      requestedTeamCount: 2,
      hardMax: 3,
      source: "demo-fallback",
    });
    const methods = result.teams.flatMap((team) =>
      team.members.map((member) => member.matchingMethod),
    );
    expect(methods.every((method) => method === "semantic")).toBe(true);
    expect(result.teams.map((team) => team.members.length)).toEqual([2, 2]);
  });
});
