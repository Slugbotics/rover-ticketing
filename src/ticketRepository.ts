import { supabase } from "./supabase";
import type { Activity, Comment, Participant, Ticket } from "./types";
import type { TicketDraft } from "./LeadTicketForm";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function loadTickets(): Promise<Ticket[]> {
  const client = requireSupabase();
  const [
    { data: rows, error },
    { data: comments, error: commentsError },
    { data: activity, error: activityError },
    { data: participants, error: participantsError },
  ] = await Promise.all([
    client
      .from("tickets")
      .select("*")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    client
      .from("ticket_comments")
      .select("*")
      .order("created_at", { ascending: true }),
    client
      .from("ticket_activity")
      .select("*")
      .order("created_at", { ascending: false }),
    client.from("ticket_participants").select("*"),
  ]);
  if (error || commentsError || activityError || participantsError)
    throw error || commentsError || activityError || participantsError;

  const userIds = new Set<string>();
  for (const participant of participants || [])
    userIds.add(participant.user_id);
  for (const comment of comments || []) userIds.add(comment.author_id);
  for (const item of activity || []) userIds.add(item.actor_id);
  const { data: profiles, error: profilesError } = userIds.size
    ? await client
        .from("member_profiles")
        .select("user_id, discord_username")
        .in("user_id", [...userIds])
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const names = new Map(
    (profiles || []).map((profile) => [
      profile.user_id,
      profile.discord_username,
    ]),
  );
  const commentsByTicket = groupBy(comments || [], "ticket_id");
  const activityByTicket = groupBy(activity || [], "ticket_id");
  const participantsByTicket = groupBy(participants || [], "ticket_id");

  return (rows || []).map((row) => {
    const ticketParticipants: Participant[] = (
      participantsByTicket.get(row.id) || []
    ).map((participant) => ({
      sessionId: participant.user_id,
      username: names.get(participant.user_id) || "Member",
    }));
    const ticketComments: Comment[] = (commentsByTicket.get(row.id) || []).map(
      (comment) => ({
        id: comment.id,
        author: names.get(comment.author_id) || "Member",
        body: comment.body,
        createdAt: comment.created_at,
      }),
    );
    const ticketActivity: Activity[] = (activityByTicket.get(row.id) || []).map(
      (item) => ({
        id: String(item.id),
        actor: names.get(item.actor_id) || "Member",
        message: item.action,
        createdAt: item.created_at,
      }),
    );
    const firstParticipant = ticketParticipants[0];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      criteria: Array.isArray(row.completion_criteria)
        ? row.completion_criteria
        : [],
      competition: row.competition,
      subteam: row.primary_subteam,
      status: row.status,
      priority: row.priority,
      beginnerFriendly: row.beginner_friendly,
      effort: row.estimated_effort || undefined,
      dueDate: row.due_date || undefined,
      parentTicketId: row.parent_ticket_id || undefined,
      participants: ticketParticipants,
      assignee: firstParticipant?.username,
      assigneeSessionId: firstParticipant?.sessionId,
      creator: names.get(row.creator_id) || "Member",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      comments: ticketComments,
      activity: ticketActivity,
      resources: [],
    };
  });
}

export async function joinTicket(ticketId: string) {
  const { data, error } = await requireSupabase().rpc("join_ticket", {
    ticket_id: ticketId,
  });
  if (error) throw error;
  return data;
}
export async function leaveTicket(ticketId: string) {
  const { data, error } = await requireSupabase().rpc("leave_ticket", {
    ticket_id: ticketId,
  });
  if (error) throw error;
  return data;
}
export async function addComment(ticketId: string, body: string) {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user)
    throw userError || new Error("Member session is unavailable.");
  const { error } = await client
    .from("ticket_comments")
    .insert({ ticket_id: ticketId, author_id: user.id, body });
  if (error) throw error;
}
export async function createSubticket(
  parent: Ticket,
  title: string,
  creatorId: string,
) {
  const client = requireSupabase();
  const childNumber =
    (
      await client
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .like("id", `${parent.id}-%`)
    ).count || 0;
  const { error } = await client.rpc("create_subticket", {
    parent_id: parent.id,
    child_id: `${parent.id}-${childNumber + 1}`,
    child_title: title.trim(),
  });
  if (error) throw error;
}
export async function createTicket(draft: TicketDraft) {
  const { error } = await requireSupabase().rpc("create_ticket", {
    ticket_title: draft.title.trim(),
    ticket_description: draft.description.trim(),
    criteria: draft.criteria
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    ticket_competition: draft.competition,
    ticket_subteam: draft.subteam,
    ticket_priority: draft.priority,
    is_beginner_friendly: draft.beginnerFriendly,
    ticket_effort: draft.effort.trim() || null,
    ticket_due_date: draft.dueDate || null,
  });
  if (error) throw error;
}
export async function leadUpdateStatus(
  ticketId: string,
  nextStatus: string,
  feedback = "",
) {
  const { error } = await requireSupabase().rpc("lead_update_status", {
    ticket_id: ticketId,
    next_status: nextStatus,
    feedback,
  });
  if (error) throw error;
}

function groupBy<T extends Record<string, string>, K extends keyof T>(
  items: T[],
  key: K,
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = item[key];
    const group = groups.get(value) || [];
    group.push(item);
    groups.set(value, group);
  }
  return groups;
}
