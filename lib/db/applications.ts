import { createClient } from "@/lib/supabase/server";

export type ApplicationStatus =
  | "已生成"
  | "已投递"
  | "笔试"
  | "一面"
  | "二面"
  | "HR面"
  | "Offer"
  | "拒信"
  | "已读不回";

export type Application = {
  id: string;
  user_id: string;
  company: string;
  position: string;
  channel: string;
  jd: string;
  selected_projects: string[];
  resume_markdown: string;
  status: ApplicationStatus;
  created_at: string;
  // Snapshot of the generated resume (added 2026-06)，老数据为 null
  sections: { title: string; html: string }[] | null;
  name: string | null;
  contact_html: string | null;
  photo_url: string | null;
};

export async function listMyApplications(): Promise<Application[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Application[];
}

export async function createApplication(input: {
  company: string;
  position: string;
  channel: string;
  jd: string;
  selected_projects: string[];
  resume_markdown: string;
  sections?: { title: string; html: string }[];
  name?: string;
  contact_html?: string;
  photo_url?: string | null;
}): Promise<Application> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { data, error } = await supabase
    .from("applications")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data as Application;
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase
    .from("applications")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function deleteApplication(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}
