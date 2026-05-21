import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const DAILY_LIMIT = Number(process.env.DAILY_LIMIT_PER_USER || 10);
const UNLIMITED_LIMIT = 999999;

function unlimitedEmails(): Set<string> {
  const raw = process.env.UNLIMITED_USER_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isUnlimitedEmail(email?: string | null): boolean {
  if (!email) return false;
  return unlimitedEmails().has(email.trim().toLowerCase());
}

export async function getMyTodayUsage(): Promise<{ count: number; limit: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { count: 0, limit: DAILY_LIMIT };

  if (isUnlimitedEmail(user.email)) {
    return { count: 0, limit: UNLIMITED_LIMIT };
  }

  const today = new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("usage_daily")
    .select("count")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  return { count: data?.count ?? 0, limit: DAILY_LIMIT };
}

export async function tryIncrementUsage(
  userId: string,
  userEmail?: string | null
): Promise<{ ok: boolean; current: number; limit: number }> {
  if (isUnlimitedEmail(userEmail)) {
    return { ok: true, current: 0, limit: UNLIMITED_LIMIT };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (admin.rpc as any).bind(admin);
  const { data, error } = await rpc("increment_usage_if_under_limit", {
    p_user_id: userId,
    p_limit: DAILY_LIMIT,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: !!row?.ok,
    current: row?.current_count ?? 0,
    limit: DAILY_LIMIT,
  };
}

export async function rollbackUsage(userId: string, userEmail?: string | null): Promise<void> {
  if (isUnlimitedEmail(userEmail)) return;
  try {
    const admin = createAdminClient();
    const today = new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (admin.from as any).bind(admin)("usage_daily");
    const { data: existing } = await table
      .select("count")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    const current = (existing as { count?: number } | null)?.count ?? 0;
    if (current > 0) {
      const { error } = await table
        .update({ count: current - 1 })
        .eq("user_id", userId)
        .eq("date", today);
      if (error) console.error("[rollbackUsage] update failed:", error);
    }
  } catch (e) {
    console.error("[rollbackUsage] unexpected:", e);
  }
}
