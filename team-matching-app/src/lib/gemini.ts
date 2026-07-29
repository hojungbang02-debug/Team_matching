import OpenAI from "openai";

const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

export function createGeminiClient(): OpenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  return new OpenAI({
    apiKey,
    baseURL: GEMINI_OPENAI_BASE_URL,
  });
}
