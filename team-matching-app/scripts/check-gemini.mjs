import OpenAI from "openai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY가 .env.local에 없습니다.");
}

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

await client.models.retrieve(
  process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.6-flash",
);
console.log("Gemini API 연결 성공");
