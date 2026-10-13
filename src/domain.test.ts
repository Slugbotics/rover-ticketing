import { describe, expect, it } from 'vitest'
import { demoTickets } from './demoData'
import { canMemberTransition, competitionMatches, filterTickets, participantsFor } from './domain'

describe('ticket board rules', () => {
  it('includes Both tickets in either competition view but not in Both-only by accident', () => {
    const both = demoTickets.find((ticket) => ticket.competition === 'Both')!
    expect(competitionMatches(both, 'URC')).toBe(true)
    expect(competitionMatches(both, 'Lunabotics')).toBe(true)
    expect(competitionMatches(both, 'Both')).toBe(true)
  })

  it('filters by search, status, and unassigned state', () => {
    const result = filterTickets(demoTickets, { competition: 'All', search: 'waypoint', subteam: 'All', status: 'In Progress', priority: 'All', beginner: false, unassigned: false })
    expect(result.map((ticket) => ticket.id)).toEqual(['RB-097'])
    expect(filterTickets(demoTickets, { competition: 'All', search: '', subteam: 'All', status: 'All', priority: 'All', beginner: false, unassigned: true }).every((ticket) => !ticket.assignee)).toBe(true)
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
})
