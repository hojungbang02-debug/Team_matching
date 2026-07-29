import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const TEACHER_COOKIE = "team_matching_teacher";
const PARTICIPANT_COOKIE = "team_matching_participant";

function getSessionSecret(): string {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) throw new Error("APP_SESSION_SECRET가 설정되지 않았습니다.");
  return secret;
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(token)
    .digest("hex");
}

function serializeSession(id: string, token: string): string {
  return `${id}.${token}`;
}

function parseSession(value: string | undefined): {
  id: string;
  token: string;
} | null {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator < 1) return null;
  return {
    id: value.slice(0, separator),
    token: value.slice(separator + 1),
  };
}

async function setSessionCookie(
  name: string,
  id: string,
  token: string,
): Promise<void> {
  const store = await cookies();
  store.set(name, serializeSession(id, token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function setTeacherSession(
  roomId: string,
  token: string,
): Promise<void> {
  await setSessionCookie(TEACHER_COOKIE, roomId, token);
}

export async function setParticipantSession(
  participantId: string,
  token: string,
): Promise<void> {
  await setSessionCookie(PARTICIPANT_COOKIE, participantId, token);
}

async function clearSessionCookie(name: string): Promise<void> {
  const store = await cookies();
  store.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function clearTeacherSession(): Promise<void> {
  await clearSessionCookie(TEACHER_COOKIE);
}

export async function getTeacherSession() {
  const store = await cookies();
  return parseSession(store.get(TEACHER_COOKIE)?.value);
}

export async function getParticipantSession() {
  const store = await cookies();
  return parseSession(store.get(PARTICIPANT_COOKIE)?.value);
}
