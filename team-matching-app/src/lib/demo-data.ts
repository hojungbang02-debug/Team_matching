import type {
  AnalyzedResponse,
  Criterion,
  ParticipantInput,
} from "@/lib/types";
import { deterministicVector } from "@/lib/matching";

const answers = [
  ["김민서", "급식 잔반을 줄이기 위해 학생이 먹을 양을 미리 선택하고 선호도를 조사하는 서비스를 만들고 싶어요."],
  ["이서준", "급식 메뉴 만족도와 남긴 양을 기록해서 다음 식단에 반영하는 시스템을 탐구하고 싶습니다."],
  ["박지우", "남는 급식을 필요한 학생과 나눌 수 있는 안전한 교내 알림 서비스를 생각했습니다."],
  ["최유진", "급식실에서 일회용품을 줄이고 다회용 식기를 편하게 반납하는 방법을 조사하고 싶습니다."],
  ["정하윤", "교실 전등과 냉난방이 비어 있을 때 자동으로 꺼지게 해서 에너지를 절약하고 싶어요."],
  ["한지호", "학교 옥상에 태양광 패널을 설치했을 때 전기 사용량이 얼마나 줄어드는지 알아보고 싶습니다."],
  ["윤서아", "교내 충전소에 소형 풍력 발전을 적용할 수 있는지 모형 실험을 해보고 싶어요."],
  ["남주원", "학생들이 직접 참여하는 에너지 절약 챌린지와 전력 사용 대시보드를 만들고 싶습니다."],
  ["배수율", "학교 주변 미세먼지를 시간대별로 측정하고 안전한 등굣길을 추천하는 지도를 만들고 싶어요."],
  ["류시아", "운동장 그늘 부족 문제를 해결하기 위해 온도 데이터를 모으고 쉼터 위치를 제안하고 싶습니다."],
  ["신재윤", "비 오는 날 복도 미끄럼 사고가 어디서 많이 나는지 조사하고 알림 표지판을 개선하고 싶어요."],
  ["문서아", "학교 화단에 어떤 곤충과 식물이 사는지 기록해서 작은 생태 지도를 만들고 싶습니다."],
  ["서지원", "학교 주변에서 사라지는 새를 관찰하고 먹이와 서식 공간을 보호하는 방법을 찾고 싶어요."],
  ["조하람", "외래 식물이 교내 생태계에 미치는 영향을 조사하고 관리 안내서를 만들고 싶습니다."],
  ["오태윤", "교실에서 나오는 플라스틱 쓰레기의 종류와 양을 조사해 분리배출 방법을 개선하고 싶어요."],
  ["강민준", "분리수거함이 헷갈리는 문제를 사진으로 인식해서 올바른 칸을 알려주는 서비스를 만들고 싶습니다."],
  ["김하윤", "학생들이 안 쓰는 학용품을 서로 교환해서 쓰레기와 비용을 줄이는 장터를 만들고 싶어요."],
  ["최은우", "학교 행사에서 발생하는 쓰레기를 줄이기 위한 다회용품 대여 시스템을 제안하고 싶습니다."],
  ["노시우", "환경이 중요하다고 생각합니다."],
  ["박지안", "기후변화에 대해 알아보고 싶어요."],
  ["정예린", "교내 종이 사용량을 학년별로 조사하고 전자 안내장으로 얼마나 줄일 수 있는지 비교하고 싶습니다."],
  ["이도윤", "급식 식재료의 이동 거리를 조사해 탄소배출이 적은 지역 식단을 제안하고 싶어요."],
  ["김도현", "축구를 좋아하고 게임도 자주 합니다."],
  ["안유나", ""],
  ["송지민", "잘 모르겠습니다."],
  ["임채원", "학교 앞 자동차 공회전 시간을 조사해 탄소배출을 줄이는 캠페인을 만들고 싶어요."],
  ["권민재", "자전거로 통학할 때 위험한 구간을 학생 제보로 모아 안전 지도를 만들고 싶습니다."],
  ["홍서윤", "빗물을 모아서 학교 화단에 사용하는 장치와 물 절약 효과를 실험하고 싶어요."],
  ["한예준", ""],
  ["유나연", "교실 공기질과 환기 시간을 측정해서 집중하기 좋은 환기 알림을 만들고 싶습니다."],
] as const;

export const demoParticipants: ParticipantInput[] = answers.map(
  ([name, answer], index) => ({
    id: `student-${String(index + 1).padStart(2, "0")}`,
    number: String(index + 1).padStart(2, "0"),
    name,
    answer,
    submitted: index !== 28,
    submittedAt: answer ? `오늘 ${14 + (index % 4)}:${String(8 + index).padStart(2, "0")}` : undefined,
  }),
);

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
