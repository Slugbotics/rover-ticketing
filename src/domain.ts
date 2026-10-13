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

export const allowedMemberTransitions: Record<Status, Status[]> = {
  Open: ['In Progress'],
  'In Progress': ['Blocked', 'In Review'],
  Blocked: ['In Progress'],
  'In Review': [],
  Done: [],
}

export function canMemberTransition(from: Status, to: Status) {
  return allowedMemberTransitions[from].includes(to)
}
