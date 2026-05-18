import { createClient } from "@/lib/supabase/server";

export type Project = {
  id: string;
  user_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type ProjectWithSignalCount = Project & { signal_count: number };

export async function listMyProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as Project[];
}

export async function listMyProjectsWithSignalCount(): Promise<ProjectWithSignalCount[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (projects || []) as Project[];
  if (rows.length === 0) return [];

  const { data: signals } = await supabase
    .from("interview_project_signals")
    .select("project_id")
    .eq("user_id", user.id);

  const counter = new Map<string, number>();
  for (const s of (signals || []) as { project_id: string | null }[]) {
    if (s.project_id) counter.set(s.project_id, (counter.get(s.project_id) || 0) + 1);
  }
  return rows.map((p) => ({ ...p, signal_count: counter.get(p.id) || 0 }));
}

export async function createProject(input: { name: string; content: string }): Promise<Project> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name: input.name, content: input.content })
    .select()
    .single();

  if (error) throw error;
  return data as Project;
}

export async function upsertProjectsBulk(
  inputs: { name: string; content: string }[]
): Promise<{ inserted: Project[]; updated: Project[] }> {
  if (inputs.length === 0) return { inserted: [], updated: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const names = Array.from(new Set(inputs.map((p) => p.name)));
  const { data: existingRows, error: queryErr } = await supabase
    .from("projects")
    .select("id, name")
    .eq("user_id", user.id)
    .in("name", names);
  if (queryErr) throw queryErr;

  const existingByName = new Map<string, string>();
  for (const row of (existingRows || []) as { id: string; name: string }[]) {
    existingByName.set(row.name, row.id);
  }

  const toInsert: { user_id: string; name: string; content: string }[] = [];
  const toUpdate: { id: string; content: string }[] = [];
  for (const p of inputs) {
    const existingId = existingByName.get(p.name);
    if (existingId) {
      toUpdate.push({ id: existingId, content: p.content });
    } else {
      toInsert.push({ user_id: user.id, name: p.name, content: p.content });
    }
  }

  let inserted: Project[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from("projects").insert(toInsert).select();
    if (error) throw error;
    inserted = (data || []) as Project[];
  }

  const updated: Project[] = [];
  for (const u of toUpdate) {
    const { data, error } = await supabase
      .from("projects")
      .update({ content: u.content, updated_at: new Date().toISOString() })
      .eq("id", u.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw error;
    if (data) updated.push(data as Project);
  }

  return { inserted, updated };
}

export async function updateProject(id: string, patch: { name?: string; content?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase
    .from("projects")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
}
