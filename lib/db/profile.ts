import { createClient } from "@/lib/supabase/server";

export type UserProfile = {
  user_id: string;
  self_profile: string;
  resume_base: string;
  photo_url: string | null;
  updated_at: string;
};

export async function getMyProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      user_id: user.id,
      self_profile: "",
      resume_base: "",
      photo_url: null,
      updated_at: new Date().toISOString(),
    };
  }
  return data as UserProfile;
}

export async function saveMyProfile(patch: {
  self_profile?: string;
  resume_base?: string;
  photo_url?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: user.id,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) throw error;
}
