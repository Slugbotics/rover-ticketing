import { useState } from 'react'
import { ArrowLeft, CalendarDays, Check, Clock3, Link as LinkIcon, UserRound, Activity as ActivityIcon, Users } from 'lucide-react'
import type { Ticket } from './types'
import { participantsFor } from './domain'

function formatDate(date?: string) { return date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date)) : 'No due date' }

type Props = {
  ticket: Ticket
  allTickets: Ticket[]
  username: string
  sessionId: string
  onBack: () => void
  onClaim: () => void
  onRelease: () => void
  onCreateSubticket: (title: string) => void
  isLead?: boolean
  onLeadStatus?: (status: string) => void
  onUpdate: (id: string, patch: Partial<Ticket>, message: string) => void
}

export function TicketDetail({ ticket, allTickets, username, sessionId, onBack, onClaim, onRelease, onCreateSubticket, isLead, onLeadStatus, onUpdate }: Props) {
  const [comment, setComment] = useState('')
  const [subticketTitle, setSubticketTitle] = useState('')
  const participants = participantsFor(ticket)
  const mine = participants.some((participant) => participant.sessionId === sessionId)
  const canClaim = ticket.status !== 'Done' && !mine
  const childTickets = allTickets.filter((candidate) => candidate.parentTicketId === ticket.id)

  function postComment(event: React.FormEvent) {
    event.preventDefault()
    if (!comment.trim()) return
    onUpdate(ticket.id, { comments: [{ id: crypto.randomUUID(), author: username, body: comment.trim(), createdAt: new Date().toISOString() }, ...ticket.comments] }, 'added a comment')
    setComment('')
  }

  function createSubticket(event: React.FormEvent) {
    event.preventDefault()
    if (!subticketTitle.trim()) return
    onCreateSubticket(subticketTitle)
    setSubticketTitle('')
  }

  return <div className="detail">
    <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to board</button>
    <div className="detail-header"><div><div className="ticket-id">{ticket.id} <span className="competition-tag">{ticket.competition}</span></div><h1>{ticket.title}</h1><p className="muted">Created by {ticket.creator} · updated {formatDate(ticket.updatedAt)}</p></div><button className="button outline"><LinkIcon size={16} /> Share</button></div>
    <div className="detail-grid">
      <section className="detail-primary">
        <div className="status-banner"><span className={`status-tag ${ticket.status.toLowerCase().replace(' ', '-')}`}>{ticket.status}</span><span className={`priority ${ticket.priority.toLowerCase()}`}>{ticket.priority} priority</span>{isLead && onLeadStatus && <select className="lead-status-select" aria-label="Lead ticket status" value={ticket.status} onChange={(event) => onLeadStatus(event.target.value)}>{['Open', 'In Progress', 'Blocked', 'In Review', 'Done'].map((status) => <option key={status}>{status}</option>)}</select>}</div>
        <section className="owner-panel"><div><p className="eyebrow">WORKING ON THIS</p><div className="participant-list">{participants.length ? participants.map((participant) => <span className="participant" key={participant.sessionId}><UserRound size={14} /> {participant.username}{participant.sessionId === sessionId && <b>You</b>}</span>) : <strong>No one yet</strong>}</div><span>{mine ? 'You are signed up for this ticket' : participants.length ? 'Your teammates are working here too' : 'This ticket is available to join'}</span></div><div className="owner-actions">{canClaim && <button className="button primary" onClick={onClaim}>{participants.length ? 'Join ticket' : 'Assign to me'}</button>}{mine && <button className="button outline" onClick={onRelease}>Take myself off</button>}</div></section>
        <article className="content-section"><h2>Description</h2><p>{ticket.description}</p></article>
        <article className="content-section"><h2>Completion criteria</h2><ul className="criteria">{ticket.criteria.map((item) => <li key={item}><span><Check size={14} /></span>{item}</li>)}</ul></article>
        {ticket.resources.length > 0 && <article className="content-section"><h2>Resources</h2>{ticket.resources.map((resource) => <a className="resource-link" href={resource.url} target="_blank" rel="noreferrer" key={resource.url}><LinkIcon size={15} /> {resource.label}</a>)}</article>}
        <article className="content-section"><div className="section-heading"><h2><Users size={15} /> Sub-tickets <span>{childTickets.length}</span></h2></div>{childTickets.map((child) => <div className="child-ticket" key={child.id}><span className="ticket-id">{child.id}</span><strong>{child.title}</strong><span className={`status-tag ${child.status.toLowerCase().replace(' ', '-')}`}>{child.status}</span></div>)}{isLead && <form className="subticket-form" onSubmit={createSubticket}><input aria-label="Sub-ticket title" value={subticketTitle} onChange={(event) => setSubticketTitle(event.target.value)} placeholder="Create a sub-ticket" /><button className="button outline" type="submit">Add sub-ticket</button></form>}</article>
        <article className="content-section"><h2>Comments <span>{ticket.comments.length}</span></h2><form className="comment-form" onSubmit={postComment}><textarea aria-label="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share a progress note or question..." rows={3} /><button className="button primary" type="submit">Post comment</button></form>{ticket.comments.map((item) => <div className="comment" key={item.id}><span className="avatar">{item.author.slice(0, 1).toUpperCase()}</span><div><strong>{item.author}</strong><small>{formatDate(item.createdAt)}</small><p>{item.body}</p></div></div>)}</article>
      </section>
      <aside className="detail-aside"><div className="meta-card"><Meta icon={<UserRound size={15} />} label="Assigned to" value={ticket.assignee || 'Unassigned'} /><Meta icon={<UserRound size={15} />} label="Subteam" value={ticket.subteam} /><Meta icon={<CalendarDays size={15} />} label="Due date" value={formatDate(ticket.dueDate)} /><Meta icon={<Clock3 size={15} />} label="Estimate" value={ticket.effort || 'Not estimated'} /></div><div className="activity"><h2><ActivityIcon size={16} /> Activity</h2>{ticket.activity.slice(0, 5).map((item) => <div className="activity-item" key={item.id}><span className="activity-line" /><p><strong>{item.actor}</strong> {item.message}<small>{formatDate(item.createdAt)}</small></p></div>)}</div></aside>
    </div>
  </div>
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="meta-row">{icon}<span><small>{label}</small><strong>{value}</strong></span></div> }
