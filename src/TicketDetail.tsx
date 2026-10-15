import { useState } from 'react'
import { Archive, ArrowLeft, CalendarDays, Check, ChevronRight, ClipboardCheck, Clock3, CornerDownRight, Link as LinkIcon, MessageSquare, Pencil, UserRound, Activity as ActivityIcon, Users } from 'lucide-react'
import type { Comment, Status, Ticket } from './types'
import { canMemberTransition, participantsFor } from './domain'
import { errorMessage } from './errors'

function formatDate(date?: string) { return date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date)) : 'No due date' }

type Props = {
  ticket: Ticket
  allTickets: Ticket[]
  username: string
  sessionId: string
  onBack: () => void
  onClaim: () => void
  onRelease: () => void
  onOpenTicket: (id: string) => void
  onCreateSubticket: (title: string, description: string) => Promise<void>
  onComment: (body: string, parentId?: string) => Promise<void>
  // True when the signed-in lead covers this ticket's subteam (server re-checks).
  leadInScope?: boolean
  onLeadStatus: (status: Status) => Promise<void>
  onMemberStatus: (status: Status) => Promise<void>
  // Set only for administrators (server re-checks).
  onEdit?: () => void
}

export function TicketDetail({ ticket, allTickets, sessionId, onBack, onClaim, onRelease, onOpenTicket, onCreateSubticket, onComment, leadInScope, onLeadStatus, onMemberStatus, onEdit }: Props) {
  const [statusError, setStatusError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const participants = participantsFor(ticket)
  const mine = participants.some((participant) => participant.sessionId === sessionId)
  const canClaim = ticket.status !== 'Done' && !mine
  const parent = ticket.parentTicketId ? allTickets.find((candidate) => candidate.id === ticket.parentTicketId) : undefined
  const childTickets = allTickets.filter((candidate) => candidate.parentTicketId === ticket.id)
  // Mirrors create_subticket: participants or scoped leads, one level deep, not on Done tickets.
  const canAddSubticket = !ticket.parentTicketId && ticket.status !== 'Done' && (mine || Boolean(leadInScope))
  const topLevelComments = ticket.comments.filter((comment) => !comment.parentId)
  const canSubmit = mine && canMemberTransition(ticket.status, 'In Review')
  const canWithdraw = mine && ticket.status === 'In Review'
  async function changeStatus(action: (status: Status) => Promise<void>, status: Status) {
    setStatusBusy(true); setStatusError('')
    try { await action(status) }
    catch (reason) { setStatusError(errorMessage(reason, 'Unable to update ticket status.')) }
    finally { setStatusBusy(false) }
  }
  const repliesTo = (id: string) => ticket.comments.filter((comment) => comment.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return <div className="detail">
    <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to board</button>
    {ticket.parentTicketId && <button className="parent-link" onClick={() => onOpenTicket(ticket.parentTicketId!)}><CornerDownRight size={14} /> Sub-ticket of <b>{ticket.parentTicketId}</b>{parent && <span>{parent.title}</span>}</button>}
    <div className="detail-header"><div><div className="ticket-id">{ticket.id} <span className="competition-tag">{ticket.competition}</span></div><h1>{ticket.title}</h1><p className="muted">Created by {ticket.creator} · updated {formatDate(ticket.updatedAt)}</p></div><div className="detail-header-actions">{onEdit && <button className="button outline" onClick={onEdit}><Pencil size={16} /> Edit</button>}<button className="button outline" onClick={() => void navigator.clipboard?.writeText(location.href)}><LinkIcon size={16} /> Share</button></div></div>
    <div className="detail-grid">
      <section className="detail-primary">
        <div className="status-banner"><span className={`status-tag ${ticket.status.toLowerCase().replace(' ', '-')}`}>{ticket.status}</span><span className={`priority ${ticket.priority.toLowerCase()}`}>{ticket.priority} priority</span>{leadInScope && <select className="lead-status-select" aria-label="Lead ticket status" value={ticket.status} disabled={statusBusy} onChange={(event) => void changeStatus(onLeadStatus, event.target.value as Status)}>{['Open', 'In Progress', 'Blocked', 'In Review', 'Done'].map((status) => <option key={status}>{status}</option>)}</select>}</div>
        {ticket.status === 'Done' && <div className="review-banner done"><Archive size={18} /><div><strong>Completed</strong><span>A lead marked this complete. It is in the archive.</span></div></div>}
        {ticket.status === 'In Review' && leadInScope && <div className="review-banner"><ClipboardCheck size={18} /><div><strong>Awaiting your review</strong><span>Check the completion criteria, then complete it or send it back.</span></div><div className="review-actions"><button className="button outline" disabled={statusBusy} onClick={() => void changeStatus(onLeadStatus, 'In Progress')}>Send back</button><button className="button primary" disabled={statusBusy} onClick={() => void changeStatus(onLeadStatus, 'Done')}><Check size={15} /> Mark complete</button></div></div>}
        {ticket.status === 'In Review' && !leadInScope && <div className="review-banner"><ClipboardCheck size={18} /><div><strong>Submitted for review</strong><span>A lead will review this work and mark it complete.</span></div></div>}
        {statusError && <p className="form-error status-error" role="alert">{statusError}</p>}
        <section className="owner-panel"><div><p className="eyebrow">WORKING ON THIS</p><div className="participant-list">{participants.length ? participants.map((participant) => <span className="participant" key={participant.sessionId}><UserRound size={14} /> {participant.username}{participant.sessionId === sessionId && <b>You</b>}</span>) : <strong>No one yet</strong>}</div><span>{mine ? 'You are signed up for this ticket' : participants.length ? 'Your teammates are working here too' : 'This ticket is available to join'}</span></div><div className="owner-actions">{canClaim && <button className="button primary" onClick={onClaim}>{participants.length ? 'Join ticket' : 'Assign to me'}</button>}{canSubmit && <button className="button primary" disabled={statusBusy} onClick={() => void changeStatus(onMemberStatus, 'In Review')}><ClipboardCheck size={15} /> Submit for review</button>}{canWithdraw && <button className="button outline" disabled={statusBusy} onClick={() => void changeStatus(onMemberStatus, 'In Progress')}>Withdraw from review</button>}{mine && ticket.status !== 'Done' && <button className="button outline" onClick={onRelease}>Take myself off</button>}</div></section>
        <article className="content-section"><h2>Description</h2><p>{ticket.description}</p></article>
        {ticket.criteria.length > 0 && <article className="content-section"><h2>Completion criteria</h2><ul className="criteria">{ticket.criteria.map((item) => <li key={item}><span><Check size={14} /></span>{item}</li>)}</ul></article>}
        {ticket.resources.length > 0 && <article className="content-section"><h2>Resources</h2>{ticket.resources.map((resource) => <a className="resource-link" href={resource.url} target="_blank" rel="noreferrer" key={resource.url}><LinkIcon size={15} /> {resource.label}</a>)}</article>}
        {!ticket.parentTicketId && <article className="content-section">
          <div className="section-heading"><h2><Users size={15} /> Sub-tickets <span>{childTickets.length}</span></h2></div>
          {childTickets.length === 0 && <p className="muted small-note">No sub-tickets yet.{canAddSubticket ? ' Split this work into smaller pieces below.' : mine || leadInScope ? '' : ' Join this ticket to break it into sub-tickets.'}</p>}
          {childTickets.map((child) => { const childPeople = participantsFor(child); return <button className="child-ticket" key={child.id} onClick={() => onOpenTicket(child.id)}><span className="ticket-id">{child.id}</span><strong>{child.title}</strong>{childPeople.length > 0 && <span className="child-people"><UserRound size={12} /> {childPeople.length}</span>}<span className={`status-tag ${child.status.toLowerCase().replace(' ', '-')}`}>{child.status}</span><ChevronRight size={15} className="row-chevron" /></button> })}
          {canAddSubticket && <SubticketForm onCreate={onCreateSubticket} />}
        </article>}
        <article className="content-section"><h2><MessageSquare size={15} /> Comments <span>{ticket.comments.length}</span></h2>
          <CommentForm placeholder="Share a progress note or question..." submitLabel="Post comment" onSubmit={(body) => onComment(body)} />
          {topLevelComments.map((item) => <CommentThread key={item.id} comment={item} replies={repliesTo(item.id)} onReply={(body) => onComment(body, item.id)} />)}
        </article>
      </section>
      <aside className="detail-aside"><div className="meta-card"><Meta icon={<UserRound size={15} />} label="Assigned to" value={ticket.assignee || 'Unassigned'} /><Meta icon={<UserRound size={15} />} label={ticket.subteams.length > 1 ? 'Subteams' : 'Subteam'} value={ticket.subteams.join(', ')} /><Meta icon={<CalendarDays size={15} />} label="Due date" value={formatDate(ticket.dueDate)} /><Meta icon={<Clock3 size={15} />} label="Estimate" value={ticket.effort || 'Not estimated'} /></div><div className="activity"><h2><ActivityIcon size={16} /> Activity</h2>{ticket.activity.slice(0, 8).map((item) => <div className="activity-item" key={item.id}><span className="activity-line" /><p><strong>{item.actor}</strong> {item.message}<small>{formatDate(item.createdAt)}</small></p></div>)}</div></aside>
    </div>
  </div>
}

function SubticketForm({ onCreate }: { onCreate: (title: string, description: string) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (title.trim().length < 3) { setError('Sub-ticket titles need at least 3 characters.'); return }
    setBusy(true); setError('')
    try { await onCreate(title, description); setTitle(''); setDescription('') }
    catch (reason) { setError(errorMessage(reason, 'Unable to create sub-ticket.')) }
    finally { setBusy(false) }
  }
  return <form className="subticket-form" onSubmit={submit}>
    <input aria-label="Sub-ticket title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Sub-ticket title" />
    <textarea aria-label="Sub-ticket description" value={description} maxLength={10000} rows={2} onChange={(event) => setDescription(event.target.value)} placeholder="What needs to be done? (optional)" />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button outline" type="submit" disabled={busy}>{busy ? 'Adding...' : 'Add sub-ticket'}</button>
  </form>
}

function CommentForm({ placeholder, submitLabel, onSubmit, onCancel, autoFocus }: { placeholder: string; submitLabel: string; onSubmit: (body: string) => Promise<void>; onCancel?: () => void; autoFocus?: boolean }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    setBusy(true); setError('')
    try { await onSubmit(body.trim()); setBody(''); onCancel?.() }
    catch (reason) { setError(errorMessage(reason, 'Unable to post comment.')) }
    finally { setBusy(false) }
  }
  return <form className="comment-form" onSubmit={submit}>
    <textarea aria-label={placeholder} value={body} maxLength={5000} autoFocus={autoFocus} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} rows={3} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="comment-form-actions">{onCancel && <button className="text-button" type="button" onClick={onCancel}>Cancel</button>}<button className="button primary" type="submit" disabled={busy}>{busy ? 'Posting...' : submitLabel}</button></div>
  </form>
}

function CommentThread({ comment, replies, onReply }: { comment: Comment; replies: Comment[]; onReply: (body: string) => Promise<void> }) {
  const [replying, setReplying] = useState(false)
  return <div className="comment-thread">
    <CommentBody comment={comment} />
    <div className="comment-replies">
      {replies.map((reply) => <CommentBody key={reply.id} comment={reply} />)}
      {replying ? <CommentForm placeholder={`Reply to ${comment.author}...`} submitLabel="Reply" autoFocus onSubmit={onReply} onCancel={() => setReplying(false)} /> : <button className="text-button reply-button" onClick={() => setReplying(true)}><CornerDownRight size={13} /> Reply</button>}
    </div>
  </div>
}

function CommentBody({ comment }: { comment: Comment }) {
  return <div className="comment"><span className="avatar">{comment.author.slice(0, 1).toUpperCase()}</span><div><strong>{comment.author}</strong><small>{formatDate(comment.createdAt)}</small><p>{comment.body}</p></div></div>
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="meta-row">{icon}<span><small>{label}</small><strong>{value}</strong></span></div> }
