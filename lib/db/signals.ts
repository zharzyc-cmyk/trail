import { createClient } from "@/lib/supabase/server";
import type { InterviewRound } from "@/lib/db/interviews";

export type Signal = {
  id: string;
  user_id: string;
  interview_id: string;
  project_id: string | null;
  quoted_question: string;
  quoted_lowlight: string;
  suggestion: string;
  created_at: string;
  updated_at: string;
};

export type EnrichedSignal = Signal & {
  interviewed_at: string;
  round: InterviewRound;
  company: string | null;
  position: string | null;
};

export type SignalDraft = {
  interview_id: string;
  project_id: string | null;
  quoted_question: string;
  quoted_lowlight: string;
  suggestion: string;
};

export async function listSignalsByInterview(interviewId: string): Promise<Signal[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("interview_project_signals")
    .select("*")
    .eq("user_id", user.id)
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as Signal[];
}

export async function listSignalsByProject(projectId: string): Promise<EnrichedSignal[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("interview_project_signals")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const signals = (data || []) as Signal[];
  if (signals.length === 0) return [];

  const interviewIds = Array.from(new Set(signals.map((s) => s.interview_id)));
  const { data: itvs } = await supabase
    .from("interviews")
    .select("id, interviewed_at, round, application_id")
    .eq("user_id", user.id)
    .in("id", interviewIds);
  const itvMap = new Map<string, { interviewed_at: string; round: InterviewRound; application_id: string | null }>();
  for (const r of (itvs || []) as { id: string; interviewed_at: string; round: InterviewRound; application_id: string | null }[]) {
    itvMap.set(r.id, { interviewed_at: r.interviewed_at, round: r.round, application_id: r.application_id });
  }

  const appIds = Array.from(
    new Set(
      Array.from(itvMap.values())
        .map((v) => v.application_id)
        .filter((x): x is string => !!x)
    )
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

  return signals.map((s) => {
    const itv = itvMap.get(s.interview_id);
    const app = itv?.application_id ? appMap.get(itv.application_id) : null;
    return {
      ...s,
      interviewed_at: itv?.interviewed_at ?? "",
      round: itv?.round ?? ("自由" as InterviewRound),
      company: app?.company ?? null,
      position: app?.position ?? null,
    };
  });
}

export async function createSignalsBulk(drafts: SignalDraft[]): Promise<Signal[]> {
  if (drafts.length === 0) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const rows = drafts.map((d) => ({
    user_id: user.id,
    interview_id: d.interview_id,
    project_id: d.project_id,
    quoted_question: d.quoted_question,
    quoted_lowlight: d.quoted_lowlight,
    suggestion: d.suggestion,
  }));
  const { data, error } = await supabase.from("interview_project_signals").insert(rows).select();
  if (error) throw error;
  return (data || []) as Signal[];
}

export async function updateSignal(
  id: string,
  patch: Partial<Pick<Signal, "project_id" | "quoted_question" | "quoted_lowlight" | "suggestion">>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase
    .from("interview_project_signals")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function deleteSignal(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase
    .from("interview_project_signals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function replaceSignalsForInterview(
  interviewId: string,
  drafts: Omit<SignalDraft, "interview_id">[]
): Promise<Signal[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error: delErr } = await supabase
    .from("interview_project_signals")
    .delete()
    .eq("user_id", user.id)
    .eq("interview_id", interviewId);
  if (delErr) throw delErr;

  if (drafts.length === 0) return [];
  return createSignalsBulk(drafts.map((d) => ({ ...d, interview_id: interviewId })));
}
