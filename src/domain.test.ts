import { describe, expect, it } from 'vitest'
import { demoTickets } from './demoData'
import { archivedTickets, boardTickets, canMemberTransition, filterTickets, leadCanReview, participantsFor, reviewQueue } from './domain'

describe('ticket board rules', () => {
  it('matches a ticket under every subteam it involves', () => {
    const filters = { search: '', status: 'All' as const, priority: 'All' as const, beginner: false, unassigned: false }
    const ids = (subteam: 'Mechanical' | 'Electrical' | 'Software') => filterTickets(demoTickets, { ...filters, subteam }).map((ticket) => ticket.id)
    expect(ids('Mechanical')).toContain('RB-104')
    expect(ids('Electrical')).toContain('RB-104')
    expect(ids('Software')).not.toContain('RB-104')
  })

  it('filters by search, status, and unassigned state', () => {
    const result = filterTickets(demoTickets, { search: 'waypoint', subteam: 'All', status: 'In Progress', priority: 'All', beginner: false, unassigned: false })
    expect(result.map((ticket) => ticket.id)).toEqual(['RB-097'])
    expect(filterTickets(demoTickets, { search: '', subteam: 'All', status: 'All', priority: 'All', beginner: false, unassigned: true }).every((ticket) => !ticket.assignee)).toBe(true)
  })

  it('only allows member-owned work to move through member transitions', () => {
    expect(canMemberTransition('Open', 'In Progress')).toBe(true)
    expect(canMemberTransition('In Progress', 'Blocked')).toBe(true)
    expect(canMemberTransition('In Progress', 'Done')).toBe(false)
    expect(canMemberTransition('In Review', 'Done')).toBe(false)
  })

  it('keeps multiple participants independent and supports legacy ownership records', () => {
    const ticket = { ...demoTickets[0], participants: [{ sessionId: 'one', username: 'alpha' }, { sessionId: 'two', username: 'beta' }] }
    expect(participantsFor(ticket).map((participant) => participant.sessionId)).toEqual(['one', 'two'])
    expect(participantsFor({ ...demoTickets[0], participants: [], assignee: 'legacy-user', assigneeSessionId: 'legacy-session' })).toEqual([{ sessionId: 'legacy-session', username: 'legacy-user' }])
  })

  it('lets members submit for review but never complete work', () => {
    expect(canMemberTransition('In Progress', 'In Review')).toBe(true)
    expect(canMemberTransition('Open', 'In Review')).toBe(true)
    expect(canMemberTransition('In Review', 'In Progress')).toBe(true)
    for (const from of ['Open', 'In Progress', 'Blocked', 'In Review', 'Done'] as const) expect(canMemberTransition(from, 'Done')).toBe(false)
  })

  it('keeps sub-tickets and completed work off the board and puts Done in the archive', () => {
    const base = demoTickets[0]
    const tickets = [
      { ...base, id: 'RB-200', status: 'Open' as const, parentTicketId: undefined },
      { ...base, id: 'RB-200-1', status: 'Open' as const, parentTicketId: 'RB-200' },
      { ...base, id: 'RB-201', status: 'Done' as const, parentTicketId: undefined },
      { ...base, id: 'RB-200-2', status: 'Done' as const, parentTicketId: 'RB-200' },
    ]
    expect(boardTickets(tickets).map((t) => t.id)).toEqual(['RB-200'])
    expect(archivedTickets(tickets).map((t) => t.id).sort()).toEqual(['RB-200-2', 'RB-201'])
  })

  it('scopes the review queue to the lead subteams unless administrator', () => {
    const base = { ...demoTickets[0], status: 'In Review' as const }
    const software = { ...base, id: 'RB-300', subteams: ['Software' as const] }
    const science = { ...base, id: 'RB-301', subteams: ['Science' as const] }
    const lead = { role: 'subteam_lead' as const, scopes: ['Software'] }
    expect(reviewQueue([software, science], lead).map((t) => t.id)).toEqual(['RB-300'])
    expect(reviewQueue([software, science], { role: 'administrator', scopes: [] })).toHaveLength(2)
    expect(leadCanReview(null, software)).toBe(false)
    expect(leadCanReview(lead, { ...science, subteams: ['Science', 'Software'] })).toBe(true)
  })
})
