import { useState } from "react";
import { ArrowLeft, LockKeyhole, X } from "lucide-react";

export function LeadSignIn({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(email.trim(), password);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Lead sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="lead-modal"
        onSubmit={submit}
        aria-labelledby="lead-sign-in-title"
      >
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close lead sign-in"
        >
          <X size={18} />
        </button>
        <p className="eyebrow">AUTHORIZED ACCESS</p>
        <h2 id="lead-sign-in-title">Lead sign-in</h2>
        <p className="muted">
          Use the authorized Supabase account for your lead role. Discord
          usernames never grant lead access.
        </p>
        <label htmlFor="lead-email">Email</label>
        <input
          id="lead-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
        />
        <label htmlFor="lead-password">Password</label>
        <input
          id="lead-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" type="submit" disabled={busy}>
          <LockKeyhole size={15} /> {busy ? "Signing in..." : "Sign in as lead"}
        </button>
        <button
          className="back-link modal-back"
          type="button"
          onClick={onClose}
        >
          <ArrowLeft size={15} /> Return to member board
        </button>
      </form>
    </div>
  );
}
