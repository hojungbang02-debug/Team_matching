import "server-only";

import { ROOM_RETENTION_HOURS } from "@/lib/room-policy";
import { hashSessionToken } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * 새 룸을 만들 때마다 기한이 지난 룸을 함께 정리합니다.
 * rooms를 지우면 참가자, 답변, 분석, 팀 결과가 함께 삭제됩니다.
 */
export async function purgeExpiredRooms(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(
    Date.now() - ROOM_RETENTION_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("rooms")
    .delete()
    .lt("created_at", cutoff)
    .select("room_code");
  if (error) {
    console.error("Purging expired rooms failed:", error.message);
    return;
  }
  if (data?.length) {
    console.info(`Purged ${data.length} expired room(s).`);
  }
}

export async function requireTeacherRoom(roomCode: string) {
  const { getTeacherSession } = await import("@/lib/session");
  const session = await getTeacherSession();
  if (!session) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", session.id)
    .eq("room_code", roomCode.toUpperCase())
    .eq("teacher_token_hash", hashSessionToken(session.token))
    .maybeSingle();
  return data;
}

export async function requireParticipant(roomId: string) {
  const { getParticipantSession } = await import("@/lib/session");
  const session = await getParticipantSession();
  if (!session) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("participants")
    .select("*")
    .eq("id", session.id)
    .eq("room_id", roomId)
    .eq("session_token_hash", hashSessionToken(session.token))
    .maybeSingle();
  return data;
}
