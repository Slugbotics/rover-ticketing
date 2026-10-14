import { supabase } from "./supabase";

export type LeadAccess = {
  role: "subteam_lead" | "administrator";
  scopes: string[];
};

export type LeadRosterEntry = {
  userId: string;
  role: LeadAccess["role"];
  scopes: string[];
  displayName: string | null;
  createdAt: string;
};

// Returns null when the user has no row in public.leads. RLS only lets a user
// read their own lead row, so this cannot grant access the database would deny.
export async function loadLeadAccess(userId: string): Promise<LeadAccess | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) return null;
  const { data: scopes, error: scopesError } = await supabase
    .from("lead_scopes")
    .select("subteam")
    .eq("user_id", userId);
  if (scopesError) throw scopesError;
  return {
    role: lead.role,
    scopes: (scopes || []).map((scope) => scope.subteam),
  };
}

export async function signInLead(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) throw error || new Error("Lead sign-in failed.");
  const access = await loadLeadAccess(data.user.id);
  if (!access) {
    await supabase.auth.signOut();
    throw new Error("This account is not authorized as a lead.");
  }
  return { userId: data.user.id, access };
}

export async function signOutLead() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Administrators can read every lead and scope row through RLS; other callers
// only see their own row.
export async function loadLeadRoster(): Promise<LeadRosterEntry[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const [
    { data: leads, error: leadsError },
    { data: scopes, error: scopesError },
  ] = await Promise.all([
    supabase.from("leads").select("user_id, role, created_at").order("created_at"),
    supabase.from("lead_scopes").select("user_id, subteam"),
  ]);
  if (leadsError || scopesError) throw leadsError || scopesError;
  const ids = (leads || []).map((lead) => lead.user_id);
  const { data: profiles, error: profilesError } = ids.length
    ? await supabase
        .from("member_profiles")
        .select("user_id, discord_username")
        .in("user_id", ids)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const names = new Map(
    (profiles || []).map((profile) => [profile.user_id, profile.discord_username]),
  );
  return (leads || []).map((lead) => ({
    userId: lead.user_id,
    role: lead.role,
    scopes: (scopes || [])
      .filter((scope) => scope.user_id === lead.user_id)
      .map((scope) => scope.subteam),
    displayName: names.get(lead.user_id) || null,
    createdAt: lead.created_at,
  }));
}
