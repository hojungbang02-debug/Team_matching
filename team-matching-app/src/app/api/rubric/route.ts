import { zodResponseFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultRubric } from "@/lib/matching-defaults";
import { createGeminiClient } from "@/lib/gemini";

const RequestSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  question: z.string().trim().min(5).max(1000),
});

const RubricSchema = z.object({
  questionIntent: z.string(),
  matchingGoal: z.string(),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
  criteria: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string(),
        weight: z.number().min(0.05).max(1),
      }),
    )
    .min(3)
    .max(5),
});

function normalizeWeights<T extends { weight: number }>(criteria: T[]): T[] {
  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (!total) return criteria;
  return criteria.map((criterion) => ({
    ...criterion,
    weight: Number((criterion.weight / total).toFixed(4)),
  }));
}

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "과목명, 과제명, 질문을 확인해 주세요." },
      { status: 400 },
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      questionIntent: `${parsed.data.subject} 수업의 자유 주제 탐구`,
      matchingGoal: "비슷한 관심 주제와 접근 방향을 가진 학생 매칭",
      needsClarification: false,
      clarificationQuestion: null,
      criteria: defaultRubric,
      source: "demo-fallback",
    });
  }

  try {
    const client = createGeminiClient();
    const response = await client.chat.completions.parse({
      model: process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.6-flash",
      messages: [
        {
          role: "system",
          content:
            "당신은 학생을 평가하는 채점자가 아니라 팀 매칭에 필요한 정보 구조를 설계하는 도우미입니다. 성실성, 능력, 인성, 창의성, 아이디어 품질을 기준으로 만들지 마세요. 교사의 질문에 답한 학생들을 비슷한 관심 주제와 방향으로 묶는 데 필요한 관찰 가능한 정보 기준 3~5개만 만드세요. 가중치는 질문의 표현과 매칭 목적에 근거해 제안하세요.",
        },
        {
          role: "user",
          content: JSON.stringify(parsed.data),
        },
      ],
      response_format: zodResponseFormat(
        RubricSchema,
        "room_matching_rubric",
      ),
    });
    const result = response.choices[0]?.message.parsed;
    if (!result) throw new Error("분석 기준 응답이 비어 있습니다.");
    return NextResponse.json({
      ...result,
      criteria: normalizeWeights(result.criteria),
      source: "gemini",
    });
  } catch {
    return NextResponse.json({
      questionIntent: `${parsed.data.subject} 수업의 자유 주제 탐구`,
      matchingGoal: "비슷한 관심 주제와 접근 방향을 가진 학생 매칭",
      needsClarification: true,
      clarificationQuestion:
        "AI 기준 생성에 실패했습니다. 기본 기준을 검토해 확정해 주세요.",
      criteria: defaultRubric,
      source: "demo-fallback",
    });
  }
}
