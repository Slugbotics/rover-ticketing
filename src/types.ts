export type Competition = 'URC' | 'Lunabotics' | 'Both'
export type Subteam = 'Mechanical' | 'Electrical' | 'Software' | 'Science' | 'General/Shared'
export type Status = 'Open' | 'In Progress' | 'Blocked' | 'In Review' | 'Done'
export type Priority = 'Low' | 'Medium' | 'High'

export type Comment = {
  id: string
  author: string
  body: string
  createdAt: string
  // Set on replies; replies are one level deep.
  parentId?: string
}

export type Activity = {
  id: string
  actor: string
  message: string
  createdAt: string
}

export type Participant = {
  sessionId: string
  username: string
}

export type Ticket = {
  id: string
  title: string
  description: string
  criteria: string[]
  competition: Competition
  subteam: Subteam
  status: Status
  priority: Priority
  beginnerFriendly: boolean
  effort?: string
  dueDate?: string
  parentTicketId?: string
  participants: Participant[]
  // Kept for compatibility with older persisted records during migration.
  assignee?: string
  assigneeSessionId?: string
  creator: string
  createdAt: string
  updatedAt: string
  comments: Comment[]
  activity: Activity[]
  resources: { label: string; url: string }[]
}
