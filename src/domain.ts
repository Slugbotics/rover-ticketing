import type { Competition, Participant, Priority, Status, Subteam, Ticket } from './types'

export const statuses: Status[] = ['Open', 'In Progress', 'Blocked', 'In Review', 'Done']
export const subteams: Subteam[] = ['Mechanical', 'Electrical', 'Software', 'Science', 'General/Shared']

export function participantsFor(ticket: Ticket): Participant[] {
  if (ticket.participants.length > 0) return ticket.participants
  return ticket.assignee && ticket.assigneeSessionId ? [{ sessionId: ticket.assigneeSessionId, username: ticket.assignee }] : []
}

export function competitionMatches(ticket: Ticket, competition: Competition | 'All') {
  return competition === 'All' || ticket.competition === competition || ticket.competition === 'Both'
}

export function filterTickets(tickets: Ticket[], filters: { competition: Competition | 'All'; search: string; subteam: Subteam | 'All'; status: Status | 'All'; priority: Priority | 'All'; beginner: boolean; unassigned: boolean }) {
  return tickets.filter((ticket) => {
    const haystack = `${ticket.title} ${ticket.description}`.toLowerCase()
    return competitionMatches(ticket, filters.competition) && haystack.includes(filters.search.toLowerCase()) && (filters.subteam === 'All' || ticket.subteam === filters.subteam) && (filters.status === 'All' || ticket.status === filters.status) && (filters.priority === 'All' || ticket.priority === filters.priority) && (!filters.beginner || ticket.beginnerFriendly) && (!filters.unassigned || participantsFor(ticket).length === 0)
  })
}

// Mirrors public.member_update_status. Only leads can move work to Done.
export const allowedMemberTransitions: Record<Status, Status[]> = {
  Open: ['In Progress', 'In Review'],
  'In Progress': ['Blocked', 'In Review'],
  Blocked: ['In Progress', 'In Review'],
  'In Review': ['In Progress'],
  Done: [],
}

export function canMemberTransition(from: Status, to: Status) {
  return allowedMemberTransitions[from].includes(to)
}

// The board lists active top-level work; sub-tickets live under their parent and in
// the My tasks list of whoever joins them, and Done tickets move to the archive.
export function boardTickets(tickets: Ticket[]) {
  return tickets.filter((ticket) => !ticket.parentTicketId && ticket.status !== 'Done')
}

export function archivedTickets(tickets: Ticket[]) {
  return tickets.filter((ticket) => ticket.status === 'Done').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export type LeadScope = { role: 'subteam_lead' | 'administrator'; scopes: string[] }

// Client-side mirror of public.is_lead(subteam); the server re-checks every action.
export function leadCanReview(access: LeadScope | null, ticket: Ticket) {
  return Boolean(access && (access.role === 'administrator' || access.scopes.includes(ticket.subteam)))
}

export function reviewQueue(tickets: Ticket[], access: LeadScope | null) {
  return tickets.filter((ticket) => ticket.status === 'In Review' && leadCanReview(access, ticket)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
}
