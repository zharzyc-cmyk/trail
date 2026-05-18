import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/db/applications";

export type InterviewRound = "笔试" | "一面" | "二面" | "HR面" | "终面" | "自由";

export const INTERVIEW_ROUNDS: InterviewRound[] = ["笔试", "一面", "二面", "HR面", "终面", "自由"];

export type Interview = {
  id: string;
  user_id: string;
  application_id: string | null;
  round: InterviewRound;
  interviewed_at: string;
  questions_md: string;
  self_score: number | null;
  lowlights: string;
  next_action: string;
  created_at: string;
  updated_at: string;
};

export type InterviewWithApp = Interview & {
  company: string | null;
  position: string | null;
};

const STATUS_RANK: Record<string, number> = {
  已生成: 0,
  已投递: 1,
  笔试: 2,
  一面: 3,
  二面: 4,
  HR面: 5,
  Offer: 99,
  拒信: 99,
  已读不回: 99,
};

const ROUND_TO_STATUS: Partial<Record<InterviewRound, ApplicationStatus>> = {
  笔试: "笔试",
  一面: "一面",
  二面: "二面",
  HR面: "HR面",
  终面: "HR面",
};

export async function listMyInterviews(): Promise<InterviewWithApp[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("user_id", user.id)
    .order("interviewed_at", { ascending: false });
  if (error) throw error;

  const rows = (data || []) as Interview[];
  const appIds = Array.from(
    new Set(rows.map((r) => r.application_id).filter((x): x is string => !!x))
  );
  const appMap = new Map<string, { company: string; position: string }>();
  if (appIds.length > 0) {
    const { data: apps } = await supabase
      .from("applications")
      .select("id, company, position")
      .in("id", appIds);
    for (const a of (apps || []) as { id: string; company: string; position: string }[]) {
      appMap.set(a.id, { company: a.company, position: a.position });
    }
  }

  return rows.map((r) => ({
    ...r,
    company: r.application_id ? appMap.get(r.application_id)?.company ?? null : null,
    position: r.application_id ? appMap.get(r.application_id)?.position ?? null : null,
  }));
}

export async function createInterview(input: {
  application_id: string | null;
  round: InterviewRound;
  interviewed_at: string;
  questions_md?: string;
  self_score?: number | null;
  lowlights?: string;
  next_action?: string;
  sync_application_status?: boolean;
}): Promise<Interview> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const row = {
    user_id: user.id,
    application_id: input.application_id,
    round: input.round,
    interviewed_at: input.interviewed_at,
    questions_md: input.questions_md ?? "",
    self_score: input.self_score ?? null,
    lowlights: input.lowlights ?? "",
    next_action: input.next_action ?? "",
  };

  const { data, error } = await supabase.from("interviews").insert(row).select().single();
  if (error) throw error;

  if (input.application_id && input.sync_application_status !== false) {
    const newStatus = ROUND_TO_STATUS[input.round];
    if (newStatus) {
      const { data: app } = await supabase
        .from("applications")
        .select("status")
        .eq("id", input.application_id)
        .eq("user_id", user.id)
        .maybeSingle();
      const curRank = STATUS_RANK[app?.status ?? "已生成"] ?? 0;
      const newRank = STATUS_RANK[newStatus] ?? 0;
      if (curRank < newRank && curRank < 99) {
        await supabase
          .from("applications")
          .update({ status: newStatus })
          .eq("id", input.application_id)
          .eq("user_id", user.id);
      }
    }
  }

  return data as Interview;
}

export async function updateInterview(
  id: string,
  patch: Partial<Pick<Interview, "round" | "interviewed_at" | "questions_md" | "self_score" | "lowlights" | "next_action">>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase
    .from("interviews")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function deleteInterview(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase.from("interviews").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
}
