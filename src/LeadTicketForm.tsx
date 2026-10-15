import { useState } from "react";
import type { Competition, Priority, Subteam, Ticket } from "./types";
import { errorMessage } from "./errors";
import { subteams } from "./domain";

export type TicketDraft = {
  title: string;
  description: string;
  criteria: string;
  competition: Competition;
  // In selection order; the first is the primary subteam.
  subteams: Subteam[];
  priority: Priority;
  beginnerFriendly: boolean;
  effort: string;
  dueDate: string;
};
const initialDraft: TicketDraft = {
  title: "",
  description: "",
  criteria: "",
  competition: "URC",
  subteams: ["General"],
  priority: "Medium",
  beginnerFriendly: false,
  effort: "",
  dueDate: "",
};

export function draftFromTicket(ticket: Ticket): TicketDraft {
  return {
    title: ticket.title,
    description: ticket.description,
    criteria: ticket.criteria.join("\n"),
    competition: ticket.competition,
    subteams: ticket.subteams,
    priority: ticket.priority,
    beginnerFriendly: ticket.beginnerFriendly,
    effort: ticket.effort || "",
    dueDate: ticket.dueDate ? ticket.dueDate.slice(0, 10) : "",
  };
}

// Pass `ticket` to edit an existing ticket instead of creating one.
export function LeadTicketForm({
  ticket,
  onClose,
  onSubmit,
}: {
  ticket?: Ticket;
  onClose: () => void;
  onSubmit: (draft: TicketDraft) => Promise<void>;
}) {
  const editing = Boolean(ticket);
  const [draft, setDraft] = useState(() =>
    ticket ? draftFromTicket(ticket) : initialDraft,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function set<K extends keyof TicketDraft>(key: K, value: TicketDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function toggleSubteam(subteam: Subteam) {
    setDraft((current) => ({
      ...current,
      subteams: current.subteams.includes(subteam)
        ? current.subteams.filter((item) => item !== subteam)
        : [...current.subteams, subteam],
    }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.title.trim().length < 3 || draft.description.trim().length < 1) {
      setError("Title and description are required.");
      return;
    }
    if (draft.subteams.length === 0) {
      setError("Choose at least one subteam.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(draft);
    } catch (reason) {
      setError(
        errorMessage(
          reason,
          editing ? "Unable to save ticket." : "Unable to create ticket.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="lead-modal ticket-form" onSubmit={submit}>
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close ticket form"
        >
          ×
        </button>
        <p className="eyebrow">
          {editing ? `ADMIN ACTION / ${ticket!.id}` : "LEAD ACTION / NEW WORK"}
        </p>
        <h2>{editing ? "Edit ticket" : "Create ticket"}</h2>
        <label htmlFor="new-title">Title</label>
        <input
          id="new-title"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          required
          minLength={3}
        />
        <label htmlFor="new-description">Description</label>
        <textarea
          id="new-description"
          rows={4}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          required
        />
        <fieldset className="subteam-picker">
          <legend>
            Subteams <span className="field-hint">select all involved</span>
          </legend>
          {subteams.map((subteam) => (
            <label className="check-control" key={subteam}>
              <input
                type="checkbox"
                checked={draft.subteams.includes(subteam)}
                onChange={() => toggleSubteam(subteam)}
              />
              {subteam}
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <label>
            Competition
            <select
              value={draft.competition}
              onChange={(e) =>
                set("competition", e.target.value as Competition)
              }
            >
              <option>URC</option>
              <option>Lunabotics</option>
              <option>Both</option>
            </select>
          </label>
          <label>
            Priority
            <select
              value={draft.priority}
              onChange={(e) => set("priority", e.target.value as Priority)}
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </label>
          <label>
            Due date
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </label>
          <label>
            Estimate
            <input
              value={draft.effort}
              maxLength={64}
              placeholder="e.g. 2-4 hours"
              onChange={(e) => set("effort", e.target.value)}
            />
          </label>
        </div>
        <label htmlFor="new-criteria">
          Completion criteria <span className="field-hint">one per line</span>
        </label>
        <textarea
          id="new-criteria"
          rows={3}
          value={draft.criteria}
          onChange={(e) => set("criteria", e.target.value)}
        />
        <label className="check-control">
          <input
            type="checkbox"
            checked={draft.beginnerFriendly}
            onChange={(e) => set("beginnerFriendly", e.target.checked)}
          />{" "}
          Beginner-friendly
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary full" disabled={busy} type="submit">
          {editing
            ? busy
              ? "Saving..."
              : "Save changes"
            : busy
              ? "Creating..."
              : "Create ticket"}
        </button>
      </form>
    </div>
  );
}
