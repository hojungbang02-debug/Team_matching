import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("rooms")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Supabase 스키마를 확인해 주세요." },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Supabase 환경변수를 확인해 주세요." },
      { status: 503 },
    );
  }
}
