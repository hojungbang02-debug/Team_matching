import type { ParticipantInput } from "@/lib/types";

const fixtureAnswers = [
  ["김민서", "급식 잔반을 줄이기 위해 학생이 먹을 양을 미리 선택하는 서비스를 만들고 싶어요."],
  ["이서준", "급식 만족도와 남긴 양을 기록해 다음 식단에 반영하는 시스템을 만들고 싶습니다."],
  ["박지우", "남은 급식을 퇴비로 재활용하는 방법과 효과를 실험하고 싶어요."],
  ["정하윤", "빈 교실의 전등과 냉난방을 자동으로 끄는 센서를 만들고 싶어요."],
  ["한지호", "학교 옥상 태양광 패널의 전기 절감 효과를 조사하고 싶습니다."],
  ["남주원", "반별 전력 사용량을 보여주는 에너지 절약 대시보드를 만들고 싶어요."],
  ["오태윤", "교실 플라스틱 쓰레기의 양을 조사해 분리배출 방법을 개선하고 싶어요."],
  ["강민준", "쓰레기 사진으로 올바른 분리수거함을 알려주는 서비스를 만들고 싶습니다."],
  ["김하윤", "사용하지 않는 학용품을 교환하는 장터를 만들어 쓰레기를 줄이고 싶어요."],
] as const;

export const testParticipants: ParticipantInput[] = fixtureAnswers.map(
  ([name, answer], index) => ({
    id: `student-${String(index + 1).padStart(2, "0")}`,
    number: String(index + 1).padStart(2, "0"),
    name,
    answer,
    submitted: true,
    submittedAt: `2026-07-29T06:${String(index).padStart(2, "0")}:00.000Z`,
  }),
);
