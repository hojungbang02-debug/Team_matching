import "server-only";

import { hashSessionToken } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

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
