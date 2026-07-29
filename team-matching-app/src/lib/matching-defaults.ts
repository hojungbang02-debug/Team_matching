import type {
  AnalyzedResponse,
  Criterion,
  ParticipantInput,
} from "@/lib/types";
import { deterministicVector } from "@/lib/matching";

export const defaultRubric: Criterion[] = [
  {
    key: "topic",
    label: "문제 주제",
    description: "학생이 관심을 보인 문제나 탐구 영역",
    weight: 0.35,
  },
  {
    key: "target",
    label: "대상과 맥락",
    description: "문제가 발생하는 대상, 장소 또는 상황",
    weight: 0.2,
  },
  {
    key: "goal",
    label: "원하는 변화",
    description: "학생이 만들고 싶은 결과나 변화",
    weight: 0.2,
  },
  {
    key: "approach",
    label: "접근 방향",
    description: "조사, 실험, 서비스 등 제안한 진행 방향",
    weight: 0.25,
  },
];

const unrelatedPattern = /축구|게임|모르겠|아무거나|없음/i;

export function buildFallbackAnalyses(
  participants: ParticipantInput[],
  rubric: Criterion[],
): AnalyzedResponse[] {
  return participants.map((participant) => {
    const answer = participant.answer.trim();
    const isEmpty = !answer;
    const isOffTopic = !isEmpty && unrelatedPattern.test(answer);
    const lengthScore = Math.min(answer.length / 90, 1);
    const detailSignals = [
      /위해|문제|줄이|개선|조사|실험|만들|서비스|시스템/.test(answer),
      /학생|학교|교실|급식|환경|에너지|생태|쓰레기/.test(answer),
      /방법|기록|측정|추천|제안|비교|지도|알림/.test(answer),
    ].filter(Boolean).length;
    const informationScore = isEmpty
      ? 0
      : isOffTopic
        ? 0.12
        : Math.min(0.3 + lengthScore * 0.35 + detailSignals * 0.1, 0.96);
    const level = Math.max(0, Math.min(4, Math.round(informationScore * 4)));
    const fields = rubric.map((criterion, index) => ({
      key: criterion.key,
      label: criterion.label,
      value:
        isEmpty || isOffTopic
          ? null
          : index === 0
            ? answer.split(/[,.]/)[0]?.slice(0, 70) || answer.slice(0, 70)
            : answer.slice(0, 90),
      level: Math.max(0, level - (index % 2)),
    }));
    const structured = fields
      .map((field) => `${field.label}: ${field.value ?? ""}`)
      .join("\n");
    return {
      participantId: participant.id,
      fields,
      informationScore,
      isEmpty,
      isOffTopic,
      hasMatchingInformation:
        !isEmpty && !isOffTopic && informationScore >= 0.35,
      reason: isEmpty
        ? "제출된 답변이 없습니다."
        : isOffTopic
          ? "질문과 직접 관련된 매칭 정보를 찾기 어렵습니다."
          : "주제와 진행 방향을 팀 매칭에 활용할 수 있습니다.",
      embedding: isEmpty || isOffTopic ? [] : deterministicVector(structured),
    };
  });
}
