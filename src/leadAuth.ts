import { supabase } from "./supabase";

export type LeadAccess = {
  role: "subteam_lead" | "administrator";
  scopes: string[];
};

export type LeadRosterEntry = {
  userId: string;
  email: string;
  role: LeadAccess["role"];
  scopes: string[];
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
    throw new Error("This account is not authorized as a lead. If you moved your lead access to Discord, use Sign in with Discord instead.");
  }
  return { userId: data.user.id, access };
}

export async function signOutLead() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Lead management goes through admin-only database functions, which re-check that
// the caller is an administrator and protect the last administrator.
export async function loadLeadRoster(): Promise<LeadRosterEntry[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("admin_list_leads");
  if (error) throw error;
  return (data || []).map(
    (row: { user_id: string; email: string; role: LeadAccess["role"]; scopes: string[]; created_at: string }) => ({
      userId: row.user_id,
      email: row.email,
      role: row.role,
      scopes: row.scopes || [],
      createdAt: row.created_at,
    }),
  );
}

export type PendingLeadGrant = {
  email: string;
  role: LeadAccess["role"];
  scopes: string[];
  createdAt: string;
};

// Returns "granted" when the account already exists and is confirmed, or "pending"
// when the grant is stored and will apply once that email's account is confirmed.
export async function grantLead(
  email: string,
  role: LeadAccess["role"],
  scopes: string[],
): Promise<"granted" | "pending"> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("admin_grant_lead", {
    lead_email: email.trim(),
    lead_role: role,
    lead_scopes: role === "administrator" ? [] : scopes,
  });
  if (error) throw error;
  return data ? "granted" : "pending";
}

export async function loadPendingLeads(): Promise<PendingLeadGrant[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("admin_list_pending_leads");
  if (error) throw error;
  return (data || []).map(
    (row: { email: string; role: LeadAccess["role"]; scopes: string[]; created_at: string }) => ({
      email: row.email,
      role: row.role,
      scopes: row.scopes || [],
      createdAt: row.created_at,
    }),
  );
}

export async function cancelPendingLead(email: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("admin_cancel_pending_lead", { lead_email: email });
  if (error) throw error;
}

export async function revokeLead(userId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("admin_revoke_lead", { lead_user: userId });
  if (error) throw error;
}
