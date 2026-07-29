import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 .env.local에 없습니다.",
  );
}

const supabase = createClient(url, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const { error } = await supabase
  .from("rooms")
  .select("id")
  .limit(1);

if (error) {
  throw new Error(`Supabase 연결 또는 migration 확인 실패: ${error.message}`);
}

console.log("Supabase 연결 및 rooms 테이블 확인 성공");
