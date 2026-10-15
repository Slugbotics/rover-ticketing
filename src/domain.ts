import type { Participant, Priority, Status, Subteam, Ticket } from './types'

export const statuses: Status[] = ['Open', 'In Progress', 'Blocked', 'In Review', 'Done']
export const subteams: Subteam[] = ['Mechanical', 'Electrical', 'Software', 'Science', 'General']
// Quick filters on the board; General is reachable from the Filters panel.
export const quickSubteams: Subteam[] = ['Mechanical', 'Electrical', 'Software', 'Science']

export function participantsFor(ticket: Ticket): Participant[] {
  if (ticket.participants.length > 0) return ticket.participants
  return ticket.assignee && ticket.assigneeSessionId ? [{ sessionId: ticket.assigneeSessionId, username: ticket.assignee }] : []
}

export function filterTickets(tickets: Ticket[], filters: { search: string; subteam: Subteam | 'All'; status: Status | 'All'; priority: Priority | 'All'; beginner: boolean; unassigned: boolean }) {
  return tickets.filter((ticket) => {
    const haystack = `${ticket.title} ${ticket.description}`.toLowerCase()
    return haystack.includes(filters.search.toLowerCase()) && (filters.subteam === 'All' || ticket.subteams.includes(filters.subteam)) && (filters.status === 'All' || ticket.status === filters.status) && (filters.priority === 'All' || ticket.priority === filters.priority) && (!filters.beginner || ticket.beginnerFriendly) && (!filters.unassigned || participantsFor(ticket).length === 0)
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

// Client-side mirror of public.is_lead_any(subteams); the server re-checks every action.
export function leadCanReview(access: LeadScope | null, ticket: Ticket) {
  return Boolean(access && (access.role === 'administrator' || ticket.subteams.some((subteam) => access.scopes.includes(subteam))))
}

export function reviewQueue(tickets: Ticket[], access: LeadScope | null) {
  return tickets.filter((ticket) => ticket.status === 'In Review' && leadCanReview(access, ticket)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
}

// Calendar helpers. Due dates are plain YYYY-MM-DD values and are compared as
// strings in local time, so a ticket never shifts a day because of time zones.
export function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// Every day shown for a month view: whole weeks (Sunday first) covering the month.
export function calendarDays(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const last = new Date(year, month + 1, 0)
  const total = Math.ceil((first.getDay() + last.getDate()) / 7) * 7
  return Array.from({ length: total }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}

export function ticketsByDueDate(tickets: Ticket[]) {
  const days = new Map<string, Ticket[]>()
  for (const ticket of tickets) {
    if (!ticket.dueDate) continue
    const key = ticket.dueDate.slice(0, 10)
    days.set(key, [...(days.get(key) || []), ticket])
  }
  return days
}

export function isOverdue(ticket: Ticket, todayKey: string) {
  return Boolean(ticket.dueDate && ticket.status !== 'Done' && ticket.dueDate.slice(0, 10) < todayKey)
}
