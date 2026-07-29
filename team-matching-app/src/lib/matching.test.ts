import { describe, expect, it } from "vitest";
import { demoParticipants, defaultRubric, buildFallbackAnalyses } from "./demo-data";
import {
  balancedCapacities,
  buildMatchResult,
  cosineSimilarity,
  deterministicVector,
  selectDiverseSeeds,
} from "./matching";

describe("matching utilities", () => {
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
    const analyses = buildFallbackAnalyses(demoParticipants, defaultRubric);
    const seedSelection = selectDiverseSeeds(analyses, 6);
    expect(new Set(seedSelection.seeds.map((seed) => seed.participantId)).size).toBe(
      seedSelection.seeds.length,
    );

    const result = buildMatchResult({
      participants: demoParticipants,
      analyses,
      requestedTeamCount: 6,
      hardMax: 6,
      source: "demo-fallback",
    });
    const assigned = result.teams.flatMap((team) =>
      team.members.map((member) => member.participantId),
    );
    expect(assigned).toHaveLength(demoParticipants.length);
    expect(new Set(assigned).size).toBe(demoParticipants.length);
  });
});
