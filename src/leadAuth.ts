import { supabase } from "./supabase";

export type LeadAccess = {
  role: "subteam_lead" | "administrator";
  scopes: string[];
};

export async function signInLead(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) throw error || new Error("Lead sign-in failed.");
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) {
    await supabase.auth.signOut();
    throw new Error("This account is not authorized as a lead.");
  }
  const { data: scopes, error: scopesError } = await supabase
    .from("lead_scopes")
    .select("subteam")
    .eq("user_id", data.user.id);
  if (scopesError) throw scopesError;
  return {
    userId: data.user.id,
    access: {
      role: lead.role,
      scopes: (scopes || []).map((scope) => scope.subteam),
    } as LeadAccess,
  };
}

export async function signOutLead() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
