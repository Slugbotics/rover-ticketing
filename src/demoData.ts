import type { Ticket } from './types'

const now = new Date().toISOString()

export const demoTickets: Ticket[] = [
  {
    id: 'RB-104', title: 'Design sealed electronics bay',
    description: 'Create a maintainable enclosure concept that protects the compute stack from dust while keeping field access practical.',
    criteria: ['Fits the current chassis envelope', 'Includes a gasket and service access plan', 'Reviewed by Mechanical and Electrical'],
    competition: 'Both', subteams: ['Mechanical', 'Electrical'], status: 'Open', priority: 'High', beginnerFriendly: true,
    effort: '2-3 lab sessions', dueDate: '2026-10-30', creator: 'Maya Chen', createdAt: now, updatedAt: now,
    participants: [], comments: [{ id: 'c1', author: 'Maya Chen', body: 'Start with the existing CAD envelope in the resources.', createdAt: now }],
    activity: [{ id: 'a1', actor: 'Maya Chen', message: 'created this ticket', createdAt: now }],
    resources: [{ label: 'Rover chassis CAD', url: 'https://github.com/Slugbotics' }],
  },
  {
    id: 'RB-097', title: 'Harden waypoint recovery behavior',
    description: 'When localization drops during an autonomous run, return to the last safe waypoint and expose a clear operator event.',
    criteria: ['Recovery is deterministic in simulation', 'Operator event contains the recovery reason', 'Add regression coverage for a dropped pose'],
    competition: 'URC', subteams: ['Software'], status: 'In Progress', priority: 'High', beginnerFriendly: false,
    effort: '1 week', participants: [{ sessionId: 'demo-rover-ada', username: 'rover-ada' }], assignee: 'rover-ada', creator: 'Jon Bell', createdAt: now, updatedAt: now,
    comments: [], activity: [{ id: 'a2', actor: 'rover-ada', message: 'claimed this ticket', createdAt: now }], resources: [],
  },
  {
    id: 'LB-041', title: 'Characterize regolith scoop angle',
    description: 'Run a small test matrix to compare scoop entry angles against sample collection consistency.',
    criteria: ['Test at three entry angles', 'Record sample mass and cycle time', 'Publish a short recommendation'],
    competition: 'Lunabotics', subteams: ['Science'], status: 'In Review', priority: 'Medium', beginnerFriendly: true,
    effort: '3 hours', participants: [{ sessionId: 'demo-kai-in-space', username: 'kai-in-space' }], assignee: 'kai-in-space', creator: 'Priya Rao', createdAt: now, updatedAt: now,
    comments: [{ id: 'c2', author: 'kai-in-space', body: 'Results and recommendation are in the submission summary.', createdAt: now }],
    activity: [{ id: 'a3', actor: 'kai-in-space', message: 'submitted work for review', createdAt: now }], resources: [],
  },
  {
    id: 'RB-088', title: 'Document radio failover checklist',
    description: 'Turn the field radio failover procedure into a short, checkable runbook for competition operators.',
    criteria: ['Covers loss, recovery, and escalation', 'Reviewed by the Electrical lead', 'Readable from a phone'],
    competition: 'URC', subteams: ['Electrical'], status: 'Blocked', priority: 'Medium', beginnerFriendly: true,
    effort: '2 hours', dueDate: '2026-10-21', participants: [{ sessionId: 'demo-sam-r', username: 'sam-r' }], assignee: 'sam-r', creator: 'Maya Chen', createdAt: now, updatedAt: now,
    comments: [], activity: [{ id: 'a4', actor: 'sam-r', message: 'marked this ticket blocked', createdAt: now }], resources: [],
  },
  {
    id: 'LB-029', title: 'Calibrate arm joint zero offsets',
    description: 'Capture repeatable zero offsets for the collection arm and document the calibration sequence.',
    criteria: ['Offsets saved to the team configuration', 'Repeatability is within the agreed tolerance', 'Calibration steps are documented'],
    competition: 'Lunabotics', subteams: ['Mechanical'], status: 'Done', priority: 'Low', beginnerFriendly: false,
    effort: 'Half day', participants: [{ sessionId: 'demo-nora-builds', username: 'nora-builds' }], assignee: 'nora-builds', creator: 'Priya Rao', createdAt: now, updatedAt: now,
    comments: [], activity: [{ id: 'a5', actor: 'Maya Chen', message: 'marked this ticket done', createdAt: now }], resources: [],
  },
]
