import { useState } from "react";
import type { Competition, Priority, Subteam } from "./types";

export type TicketDraft = {
  title: string;
  description: string;
  criteria: string;
  competition: Competition;
  subteam: Subteam;
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
  subteam: "General/Shared",
  priority: "Medium",
  beginnerFriendly: false,
  effort: "",
  dueDate: "",
};

export function LeadTicketForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (draft: TicketDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function set<K extends keyof TicketDraft>(key: K, value: TicketDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.title.trim().length < 3 || draft.description.trim().length < 1) {
      setError("Title and description are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(draft);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create ticket.",
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
        <p className="eyebrow">LEAD ACTION / NEW WORK</p>
        <h2>Create ticket</h2>
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
            Subteam
            <select
              value={draft.subteam}
              onChange={(e) => set("subteam", e.target.value as Subteam)}
            >
              {[
                "Mechanical",
                "Electrical",
                "Software",
                "Science",
                "General/Shared",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
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
          {busy ? "Creating..." : "Create ticket"}
        </button>
      </form>
    </div>
  );
}
