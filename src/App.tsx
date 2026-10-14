import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity as ActivityIcon,
  Archive,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  CircleAlert,
  Clock3,
  Filter,
  Flag,
  Hash,
  LayoutDashboard,
  Link as LinkIcon,
  LogIn,
  LogOut,
  Plus,
  MessageSquare,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { demoTickets } from "./demoData";
import type { Competition, Priority, Status, Subteam, Ticket } from "./types";
import { hasSupabaseConfig } from "./supabase";
import {
  archivedTickets,
  boardTickets,
  filterTickets,
  leadCanReview,
  participantsFor,
  reviewQueue,
  statuses,
  subteams,
} from "./domain";
import { TicketDetail as SessionTicketDetail } from "./TicketDetail";
import {
  endMemberIdentity,
  ensureMemberIdentity,
  saveMemberUsername,
} from "./memberAuth";
import {
  addComment,
  createSubticket as createSharedSubticket,
  joinTicket,
  leaveTicket,
  loadTickets,
} from "./ticketRepository";
import { LeadSignIn } from "./LeadSignIn";
import {
  loadLeadAccess,
  loadLeadRoster,
  signInLead,
  signOutLead,
  type LeadAccess,
  type LeadRosterEntry,
} from "./leadAuth";
import { LeadTicketForm, type TicketDraft } from "./LeadTicketForm";
import {
  createTicket as createSharedTicket,
  leadUpdateStatus,
  memberUpdateStatus,
} from "./ticketRepository";
import { errorMessage } from "./errors";

type View = "board" | "mine" | "review" | "archive" | "lead" | "admin";

function formatDate(date?: string) {
  return date
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date(date))
    : "No due date";
}

export function App() {
  const demoMode =
    import.meta.env.VITE_DEMO_MODE === "true" || !hasSupabaseConfig;
  const demoData = !hasSupabaseConfig;
  const [username, setUsername] = useState(() =>
    !hasSupabaseConfig ? sessionStorage.getItem("rover-username") || "" : "",
  );
  const [sessionId, setSessionId] = useState(() => {
    const existing = sessionStorage.getItem("rover-session-id");
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem("rover-session-id", created);
    return created;
  });
  const [draftUsername, setDraftUsername] = useState("");
  const [view, setView] = useState<View>("board");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    new URLSearchParams(location.search).get("ticket"),
  );
  const [tickets, setTickets] = useState<Ticket[]>(() =>
    hasSupabaseConfig ? [] : demoTickets,
  );
  const [competition, setCompetition] = useState<Competition | "All">("All");
  const [search, setSearch] = useState("");
  const [subteam, setSubteam] = useState<Subteam | "All">("All");
  const [status, setStatus] = useState<Status | "All">("All");
  const [priority, setPriority] = useState<Priority | "All">("All");
  const [beginner, setBeginner] = useState(false);
  const [unassigned, setUnassigned] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showUsername, setShowUsername] = useState(false);
  const identityRef = useRef<HTMLDivElement>(null);
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("rover-theme") !== "light",
  );
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [authError, setAuthError] = useState("");
  const [dataReady, setDataReady] = useState(!hasSupabaseConfig);
  const [showLeadSignIn, setShowLeadSignIn] = useState(false);
  const [leadAccess, setLeadAccess] = useState<LeadAccess | null>(null);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const isAdmin = leadAccess?.role === "administrator";

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("rover-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (!showUsername) return;
    function closeOnOutside(event: MouseEvent) {
      if (!identityRef.current?.contains(event.target as Node))
        setShowUsername(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowUsername(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showUsername]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    ensureMemberIdentity()
      .then(async (identity) => {
        // A persisted password session is a lead account; restore its access
        // instead of silently treating it as an anonymous member.
        if (!identity.user.is_anonymous) {
          const access = await loadLeadAccess(identity.user.id);
          if (access) setLeadAccess(access);
          else {
            await endMemberIdentity();
            identity = await ensureMemberIdentity();
          }
        }
        setSessionId(identity.user.id);
        if (identity.username) setUsername(identity.username);
        setAuthReady(true);
        loadTickets()
          .then((loadedTickets) => setTickets(loadedTickets))
          .catch((error: Error) => setAuthError(error.message))
          .finally(() => setDataReady(true));
      })
      .catch((error: Error) => {
        setAuthError(error.message);
        setAuthReady(true);
      });
  }, []);

  const filtered = useMemo(
    () =>
      filterTickets(boardTickets(tickets), {
        competition,
        search,
        subteam,
        status,
        priority,
        beginner,
        unassigned,
      }),
    [
      tickets,
      competition,
      search,
      subteam,
      status,
      priority,
      beginner,
      unassigned,
    ],
  );
  const selected = tickets.find((ticket) => ticket.id === selectedId);
  const queue = useMemo(() => reviewQueue(tickets, leadAccess), [tickets, leadAccess]);
  const archive = useMemo(() => archivedTickets(tickets), [tickets]);

  async function enterBoard(event: React.FormEvent) {
    event.preventDefault();
    const clean = draftUsername.trim();
    if (clean.length < 2) return;
    if (hasSupabaseConfig) {
      try {
        const identity = await ensureMemberIdentity();
        await saveMemberUsername(identity.user.id, clean);
        setSessionId(identity.user.id);
        setTickets(await loadTickets());
      } catch (error) {
        setAuthError(
          errorMessage(error, "Unable to save member profile."),
        );
        return;
      }
    } else sessionStorage.setItem("rover-username", clean);
    setUsername(clean);
  }
  function openTicket(id: string) {
    setSelectedId(id);
    history.pushState({}, "", `?ticket=${id}`);
    window.scrollTo({ top: 0 });
  }
  function closeTicket() {
    setSelectedId(null);
    history.pushState({}, "", location.pathname);
  }
  async function updateTicket(
    id: string,
    patch: Partial<Ticket>,
    message: string,
  ) {
    if (hasSupabaseConfig && patch.comments) {
      const latestComment = patch.comments[0];
      try {
        await addComment(id, latestComment.body);
        setTickets(await loadTickets());
      } catch (error) {
        setAuthError(
          errorMessage(error, "Unable to save comment."),
        );
      }
      return;
    }
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === id
          ? {
              ...ticket,
              ...patch,
              updatedAt: new Date().toISOString(),
              activity: [
                {
                  id: crypto.randomUUID(),
                  actor: username,
                  message,
                  createdAt: new Date().toISOString(),
                },
                ...ticket.activity,
              ],
            }
          : ticket,
      ),
    );
  }
  async function claim(ticket: Ticket) {
    const participants = participantsFor(ticket);
    if (
      ticket.status !== "Done" &&
      !participants.some((participant) => participant.sessionId === sessionId)
    ) {
      if (hasSupabaseConfig) {
        try {
          await joinTicket(ticket.id);
          setTickets(await loadTickets());
        } catch (error) {
          setAuthError(
            errorMessage(error, "Unable to join ticket."),
          );
        }
      } else {
        const nextParticipants = [...participants, { sessionId, username }];
        updateTicket(
          ticket.id,
          {
            participants: nextParticipants,
            assignee: ticket.assignee || username,
            assigneeSessionId: ticket.assigneeSessionId || sessionId,
            status: ticket.status === "Open" ? "In Progress" : ticket.status,
          },
          "joined this ticket",
        );
      }
    }
  }
  async function release(ticket: Ticket) {
    const participants = participantsFor(ticket);
    if (
      participants.some((participant) => participant.sessionId === sessionId)
    ) {
      if (hasSupabaseConfig) {
        try {
          await leaveTicket(ticket.id);
          setTickets(await loadTickets());
        } catch (error) {
          setAuthError(
            errorMessage(error, "Unable to leave ticket."),
          );
        }
      } else {
        const remaining = participants.filter(
          (participant) => participant.sessionId !== sessionId,
        );
        updateTicket(
          ticket.id,
          {
            participants: remaining,
            assignee: remaining[0]?.username,
            assigneeSessionId: remaining[0]?.sessionId,
            status: remaining.length === 0 ? "Open" : ticket.status,
          },
          "left this ticket",
        );
      }
    }
  }
  async function addSharedComment(
    ticketId: string,
    body: string,
    parentId?: string,
  ) {
    if (hasSupabaseConfig) {
      await addComment(ticketId, body, parentId);
      setTickets(await loadTickets());
    } else
      updateTicket(
        ticketId,
        {
          comments: [
            ...(tickets.find((ticket) => ticket.id === ticketId)?.comments ||
              []),
            {
              id: crypto.randomUUID(),
              author: username,
              body,
              createdAt: new Date().toISOString(),
              parentId,
            },
          ],
        },
        parentId ? "replied to a comment" : "added a comment",
      );
  }
  async function createSubticket(
    parent: Ticket,
    title: string,
    description: string,
  ) {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (hasSupabaseConfig) {
      await createSharedSubticket(parent.id, cleanTitle, description);
      setTickets(await loadTickets());
    } else {
      const childNumber =
        tickets.filter((ticket) => ticket.parentTicketId === parent.id).length +
        1;
      const now = new Date().toISOString();
      const child: Ticket = {
        id: `${parent.id}-${childNumber}`,
        title: cleanTitle,
        description:
          description.trim() ||
          `Sub-ticket for ${parent.title}. Add the implementation details and completion notes here.`,
        criteria: [],
        competition: parent.competition,
        subteam: parent.subteam,
        status: "Open",
        priority: parent.priority,
        beginnerFriendly: parent.beginnerFriendly,
        creator: username,
        createdAt: now,
        updatedAt: now,
        participants: [],
        comments: [],
        activity: [
          {
            id: crypto.randomUUID(),
            actor: username,
            message: `created this sub-ticket under ${parent.id}`,
            createdAt: now,
          },
        ],
        resources: [],
        parentTicketId: parent.id,
      };
      setTickets((current) => [...current, child]);
    }
  }
  async function resetSession() {
    const nextSessionId = crypto.randomUUID();
    if (hasSupabaseConfig) {
      try {
        await endMemberIdentity();
      } catch (error) {
        setAuthError(
          errorMessage(error, "Unable to end member session."),
        );
        return;
      }
    }
    sessionStorage.setItem("rover-session-id", nextSessionId);
    sessionStorage.removeItem("rover-username");
    setSessionId(nextSessionId);
    setUsername("");
    setDraftUsername("");
  }

  async function handleLeadSignIn(email: string, password: string) {
    const result = await signInLead(email, password);
    // The lead account replaces the anonymous member session, so adopt its
    // identity and give it a display name if it has none yet.
    const identity = await ensureMemberIdentity();
    if (identity.username) setUsername(identity.username);
    else if (username) await saveMemberUsername(result.userId, username);
    setSessionId(result.userId);
    setLeadAccess(result.access);
    setShowLeadSignIn(false);
    setView("lead");
    setAuthError("");
  }

  async function handleLeadSignOut() {
    try {
      await signOutLead();
    } catch (error) {
      setAuthError(errorMessage(error, "Unable to sign out."));
      return;
    }
    setLeadAccess(null);
    setView("board");
    closeTicket();
    setUsername("");
    setDraftUsername("");
  }

  async function createLeadTicket(draft: TicketDraft) {
    if (!leadAccess) throw new Error("Lead authorization is required.");
    if (!hasSupabaseConfig)
      throw new Error("Ticket creation requires Supabase.");
    await createSharedTicket(draft);
    setTickets(await loadTickets());
    setShowTicketForm(false);
  }
  // Callers show errors inline, so these throw instead of replacing the page.
  async function updateLeadStatus(ticket: Ticket, status: Status) {
    if (!leadAccess) throw new Error("Lead authorization is required.");
    if (!hasSupabaseConfig) {
      updateTicket(ticket.id, { status }, `moved this ticket to ${status}`);
      return;
    }
    await leadUpdateStatus(ticket.id, status);
    setTickets(await loadTickets());
  }
  async function updateMemberStatus(ticket: Ticket, status: Status) {
    if (!hasSupabaseConfig) {
      updateTicket(ticket.id, { status }, `moved this ticket to ${status}`);
      return;
    }
    await memberUpdateStatus(ticket.id, status);
    setTickets(await loadTickets());
  }

  if (!authReady)
    return (
      <main className="entry-screen">
        <div className="entry-card">
          <p className="eyebrow">CONNECTING MEMBER SESSION</p>
          <h2>Preparing your private workspace.</h2>
          <p>Connecting to Supabase authentication...</p>
        </div>
      </main>
    );
  if (authError && hasSupabaseConfig)
    return (
      <main className="entry-screen">
        <div className="entry-card">
          <p className="eyebrow">MEMBER SESSION ERROR</p>
          <h2>Could not connect to the ticket board.</h2>
          <p>{authError}</p>
          <button className="button primary" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  if (!dataReady)
    return (
      <main className="entry-screen">
        <div className="entry-card">
          <p className="eyebrow">LOADING SHARED BOARD</p>
          <h2>Fetching tickets.</h2>
          <p>Loading the shared Supabase board...</p>
        </div>
      </main>
    );
  if (!username)
    return (
      <EntryScreen
        draftUsername={draftUsername}
        setDraftUsername={setDraftUsername}
        onSubmit={enterBoard}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((current) => !current)}
      />
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href={location.pathname}
          aria-label="Slugbotics ticket board"
        >
          <span className="brand-mark">S</span>
          <span>
            <strong>SLUGBOTICS</strong>
            <small>ROVER TEAM / TICKET BOARD</small>
          </span>
        </a>
        <div className="top-actions">
          {demoMode && (
            <span className="demo-pill">
              <Sparkles size={14} /> DEMO MODE
            </span>
          )}
          {leadAccess && (
            <button
              className="button top-create"
              onClick={() => setShowTicketForm(true)}
            >
              <Plus size={15} /> New ticket
            </button>
          )}
          <button
            className="theme-toggle"
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setDarkMode((current) => !current)}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="identity-anchor" ref={identityRef}>
            <button
              className="user-button"
              aria-expanded={showUsername}
              onClick={() => setShowUsername(!showUsername)}
            >
              <UserRound size={16} /> {username}
              <ChevronRight size={15} />
            </button>
            {showUsername && (
              <div className="identity-popover">
                <p className="identity-name">
                  Signed in as <strong>{username}</strong>
                </p>
                <button
                  className="button primary full"
                  type="button"
                  onClick={() => {
                    setShowUsername(false);
                    void (leadAccess ? handleLeadSignOut() : resetSession());
                  }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <p className="eyebrow">WORKSPACE</p>
          <nav aria-label="Workspace navigation">
            <NavButton
              icon={<LayoutDashboard size={17} />}
              label="Ticket board"
              active={view === "board"}
              onClick={() => {
                setView("board");
                closeTicket();
              }}
            />
            <NavButton
              icon={<Check size={17} />}
              label="My tasks"
              active={view === "mine"}
              onClick={() => {
                setView("mine");
                closeTicket();
              }}
              count={
                tickets.filter(
                  (t) =>
                    participantsFor(t).some(
                      (participant) => participant.sessionId === sessionId,
                    ) && t.status !== "Done",
                ).length
              }
            />
            <NavButton
              icon={<Archive size={17} />}
              label="Archive"
              active={view === "archive"}
              onClick={() => {
                setView("archive");
                closeTicket();
              }}
            />
            {leadAccess && (
              <NavButton
                icon={<ClipboardCheck size={17} />}
                label="Review queue"
                active={view === "review"}
                onClick={() => {
                  setView("review");
                  closeTicket();
                }}
                count={queue.length}
              />
            )}
            {leadAccess && (
              <NavButton
                icon={<Flag size={17} />}
                label="Lead overview"
                active={view === "lead"}
                onClick={() => {
                  setView("lead");
                  closeTicket();
                }}
              />
            )}
            {isAdmin && (
              <NavButton
                icon={<Settings size={17} />}
                label="Administration"
                active={view === "admin"}
                onClick={() => {
                  setView("admin");
                  closeTicket();
                }}
              />
            )}
          </nav>
          <div className="sidebar-foot">
            <div className="online-dot" /> <span>Shared board online</span>
            {leadAccess ? (
              <>
                <span className="lead-session">
                  <ShieldCheck size={14} />{" "}
                  {isAdmin ? "Administrator" : "Lead session"}
                </span>
                <button
                  className="lead-link"
                  onClick={() => void handleLeadSignOut()}
                >
                  <LogOut size={14} /> Sign out of lead account
                </button>
              </>
            ) : (
              <button
                className="lead-link"
                onClick={() => setShowLeadSignIn(true)}
              >
                <LogIn size={14} /> Lead sign-in
              </button>
            )}
          </div>
        </aside>
        <main className="main-content">
          {selected ? (
            <SessionTicketDetail
              ticket={selected}
              allTickets={tickets}
              username={username}
              sessionId={sessionId}
              onBack={closeTicket}
              onClaim={() => claim(selected)}
              onRelease={() => release(selected)}
              onOpenTicket={openTicket}
              onCreateSubticket={(title, description) =>
                createSubticket(selected, title, description)
              }
              onComment={(body, parentId) =>
                addSharedComment(selected.id, body, parentId)
              }
              leadInScope={leadCanReview(leadAccess, selected)}
              onLeadStatus={(status) => updateLeadStatus(selected, status)}
              onMemberStatus={(status) => updateMemberStatus(selected, status)}
            />
          ) : view === "lead" && leadAccess ? (
            <LeadOverviewBase
              tickets={tickets}
              onCreateTicket={() => setShowTicketForm(true)}
            />
          ) : view === "admin" && isAdmin ? (
            <AdminView />
          ) : view === "review" && leadAccess ? (
            <ReviewQueueView
              tickets={queue}
              openTicket={openTicket}
              onDecision={(ticket, status) => updateLeadStatus(ticket, status)}
            />
          ) : view === "archive" ? (
            <ArchiveView
              tickets={archive}
              openTicket={openTicket}
              username={username}
            />
          ) : view === "mine" ? (
            <MyTasksView
              tickets={tickets.filter((ticket) =>
                participantsFor(ticket).some(
                  (participant) => participant.sessionId === sessionId,
                ),
              )}
              openTicket={openTicket}
              username={username}
            />
          ) : (
            <BoardView
              tickets={filtered}
              allTickets={boardTickets(tickets)}
              competition={competition}
              setCompetition={setCompetition}
              search={search}
              setSearch={setSearch}
              showFilters={showFilters}
              setShowFilters={setShowFilters}
              subteam={subteam}
              setSubteam={setSubteam}
              status={status}
              setStatus={setStatus}
              priority={priority}
              setPriority={setPriority}
              beginner={beginner}
              setBeginner={setBeginner}
              unassigned={unassigned}
              setUnassigned={setUnassigned}
              openTicket={openTicket}
              username={username}
            />
          )}
        </main>
      </div>
      {demoData && (
        <div className="config-notice">
          <CircleAlert size={15} /> Demo ticket data only. Configure Supabase
          for shared persistence.
        </div>
      )}
      {showLeadSignIn && (
        <LeadSignIn
          onClose={() => setShowLeadSignIn(false)}
          onSubmit={handleLeadSignIn}
        />
      )}
      {showTicketForm && (
        <LeadTicketForm
          onClose={() => setShowTicketForm(false)}
          onSubmit={createLeadTicket}
        />
      )}
    </div>
  );
}

function EntryScreen({
  draftUsername,
  setDraftUsername,
  onSubmit,
  darkMode,
  onToggleTheme,
}: {
  draftUsername: string;
  setDraftUsername: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <main className="entry-screen">
      <div className="entry-grid">
        <div className="entry-copy">
          <span className="brand-mark large">S</span>
          <p className="eyebrow">SLUGBOTICS / ROVER TEAM</p>
          <h1>
            Make the next run <em>count.</em>
          </h1>
          <p className="lede">
            A shared work board for the people building, testing, and driving
            our competition rovers.
          </p>
          <div className="entry-stats">
            <span>
              <strong>URC</strong> desert field
            </span>
            <span>
              <strong>LUNABOTICS</strong> lunar terrain
            </span>
          </div>
        </div>
        <form className="entry-card" onSubmit={onSubmit}>
          <div className="entry-card-head">
            <p className="eyebrow">MEMBER ENTRY</p>
            <button
              className="theme-toggle"
              aria-label={
                darkMode ? "Switch to light mode" : "Switch to dark mode"
              }
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              onClick={onToggleTheme}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <h2>Welcome to the board.</h2>
          <p>
            Enter your Discord username to view work and keep your progress
            attached to this browser session.
          </p>
          <label htmlFor="discord-username">Discord username</label>
          <input
            autoFocus
            id="discord-username"
            value={draftUsername}
            onChange={(event) => setDraftUsername(event.target.value)}
            placeholder="e.g. rover-ada"
            required
            minLength={2}
          />
          <button className="button primary full" type="submit">
            Enter ticket board <ChevronRight size={17} />
          </button>
          <small className="fine-print">
            This is a self-reported display name, not Discord verification.
            Browser-scoped ownership does not transfer automatically between
            devices.
          </small>
          <div className="entry-signin">
            <ShieldCheck size={15} /> Leads use the discreet sign-in inside the
            board.
          </div>
        </form>
      </div>
    </main>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      className={`nav-button ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {count ? <b>{count}</b> : null}
    </button>
  );
}

function BoardView(props: {
  tickets: Ticket[];
  allTickets: Ticket[];
  competition: Competition | "All";
  setCompetition: (value: Competition | "All") => void;
  search: string;
  setSearch: (value: string) => void;
  showFilters: boolean;
  setShowFilters: (value: boolean) => void;
  subteam: Subteam | "All";
  setSubteam: (value: Subteam | "All") => void;
  status: Status | "All";
  setStatus: (value: Status | "All") => void;
  priority: Priority | "All";
  setPriority: (value: Priority | "All") => void;
  beginner: boolean;
  setBeginner: (value: boolean) => void;
  unassigned: boolean;
  setUnassigned: (value: boolean) => void;
  openTicket: (id: string) => void;
  username: string;
}) {
  const {
    tickets,
    allTickets,
    competition,
    setCompetition,
    search,
    setSearch,
    showFilters,
    setShowFilters,
    subteam,
    setSubteam,
    status,
    setStatus,
    priority,
    setPriority,
    beginner,
    setBeginner,
    unassigned,
    setUnassigned,
    openTicket,
    username,
  } = props;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OPERATIONS / SHARED WORK</p>
          <h1>Ticket board</h1>
          <p className="muted">Turn open questions into field-ready work.</p>
        </div>
        <div className="heading-meta">
          <span>
            <strong>
              {allTickets.filter((t) => t.status !== "Done").length}
            </strong>{" "}
            active tickets
          </span>
          <span>
            <strong>
              {allTickets.filter((t) => t.status === "In Review").length}
            </strong>{" "}
            awaiting review
          </span>
        </div>
      </div>
      <div className="board-toolbar">
        <div className="segmented" role="group" aria-label="Competition filter">
          {(["All", "URC", "Lunabotics", "Both"] as const).map((item) => (
            <button
              key={item}
              className={competition === item ? "selected" : ""}
              onClick={() => setCompetition(item)}
            >
              {item === "All" ? "All work" : item}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Search tickets"
              placeholder="Search tickets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            className={`button outline ${showFilters ? "pressed" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} /> Filters
          </button>
        </div>
      </div>
      {showFilters && (
        <div className="filter-panel">
          <Select
            label="Subteam"
            value={subteam}
            options={["All", ...subteams]}
            onChange={(value) => setSubteam(value as Subteam | "All")}
          />
          <Select
            label="Status"
            value={status}
            options={["All", ...statuses.filter((item) => item !== "Done")]}
            onChange={(value) => setStatus(value as Status | "All")}
          />
          <Select
            label="Priority"
            value={priority}
            options={["All", "Low", "Medium", "High"]}
            onChange={(value) => setPriority(value as Priority | "All")}
          />
          <label className="check-control">
            <input
              type="checkbox"
              checked={beginner}
              onChange={(e) => setBeginner(e.target.checked)}
            />{" "}
            Beginner-friendly
          </label>
          <label className="check-control">
            <input
              type="checkbox"
              checked={unassigned}
              onChange={(e) => setUnassigned(e.target.checked)}
            />{" "}
            Unassigned only
          </label>
        </div>
      )}
      <div className="results-line">
        <span>{tickets.length} tickets shown</span>
        <span className="legend">
          <i className="dot open" /> Open <i className="dot review" /> In review{" "}
          <i className="dot blocked" /> Blocked
        </span>
      </div>
      <div className="ticket-list">
        {tickets.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            openTicket={openTicket}
            username={username}
          />
        ))}
        {tickets.length === 0 && (
          <div className="empty-state">
            <Search size={28} />
            {allTickets.length === 0 ? (
              <>
                <h3>No tickets have been created yet.</h3>
                <p>
                  An authorized lead can create the first ticket, or run the
                  optional Supabase seed script.
                </p>
              </>
            ) : (
              <>
                <h3>No tickets match those filters.</h3>
                <p>Try clearing a filter or searching a broader term.</p>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function TicketRow({
  ticket,
  openTicket,
  username,
}: {
  ticket: Ticket;
  openTicket: (id: string) => void;
  username: string;
}) {
  return (
    <button className="ticket-row" onClick={() => openTicket(ticket.id)}>
      <div className="ticket-icon">
        <Hash size={19} />
      </div>
      <div className="ticket-main">
        <div className="ticket-title-line">
          <span className="ticket-id">{ticket.id}</span>
          <h3>{ticket.title}</h3>
          {ticket.parentTicketId && (
            <span className="plain-tag">Sub-ticket of {ticket.parentTicketId}</span>
          )}
          {ticket.beginnerFriendly && (
            <span className="beginner">Beginner-friendly</span>
          )}
        </div>
        <p>{ticket.description}</p>
        <div className="ticket-tags">
          <span
            className={`status-tag ${ticket.status.toLowerCase().replace(" ", "-")}`}
          >
            {ticket.status}
          </span>
          <span className="plain-tag">{ticket.subteam}</span>
          <span className={`priority ${ticket.priority.toLowerCase()}`}>
            {ticket.priority} priority
          </span>
        </div>
      </div>
      <div className="ticket-side">
        <span className="competition-tag">{ticket.competition}</span>
        <span className="assignee">
          {ticket.assignee ? (
            <>
              <UserRound size={14} />{" "}
              {ticket.assignee === username ? "You" : ticket.assignee}
            </>
          ) : (
            <>
              <Users size={14} /> Unassigned
            </>
          )}
        </span>
        <ChevronRight size={18} className="row-chevron" />
      </div>
    </button>
  );
}

function MyTasksView({
  tickets,
  openTicket,
  username,
}: {
  tickets: Ticket[];
  openTicket: (id: string) => void;
  username: string;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE / YOUR COMMITMENTS</p>
          <h1>My tasks</h1>
          <p className="muted">
            Tickets signed up for in this browser session.
          </p>
        </div>
        <div className="heading-meta">
          <span>
            <strong>
              {tickets.filter((ticket) => ticket.status !== "Done").length}
            </strong>{" "}
            active
          </span>
          <span>
            <strong>
              {tickets.filter((ticket) => ticket.status === "Done").length}
            </strong>{" "}
            completed
          </span>
        </div>
      </div>
      <div className="results-line">
        <span>{tickets.length} tickets signed up for</span>
        <span className="assignee">
          <UserRound size={14} /> {username}
        </span>
      </div>
      <div className="ticket-list">
        {tickets.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            openTicket={openTicket}
            username={username}
          />
        ))}
        {tickets.length === 0 && (
          <div className="empty-state">
            <Check size={28} />
            <h3>No tickets signed up for yet.</h3>
            <p>
              Open a ticket from the board and choose Claim ticket to add it
              here.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="select-control">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function LegacyTicketDetail({
  ticket,
  username,
  onBack,
  onClaim,
  onUpdate,
}: {
  ticket: Ticket;
  username: string;
  onBack: () => void;
  onClaim: () => void;
  onUpdate: (id: string, patch: Partial<Ticket>, message: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [summary, setSummary] = useState("");
  const canClaim = ticket.status === "Open" && !ticket.assignee;
  const mine = ticket.assignee === username;
  function postComment(event: React.FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    onUpdate(
      ticket.id,
      {
        comments: [
          {
            id: crypto.randomUUID(),
            author: username,
            body: comment.trim(),
            createdAt: new Date().toISOString(),
          },
          ...ticket.comments,
        ],
      },
      "added a comment",
    );
    setComment("");
  }
  return (
    <div className="detail">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Back to board
      </button>
      <div className="detail-header">
        <div>
          <div className="ticket-id">
            {ticket.id}{" "}
            <span className="competition-tag">{ticket.competition}</span>
          </div>
          <h1>{ticket.title}</h1>
          <p className="muted">
            Created by {ticket.creator} · updated {formatDate(ticket.updatedAt)}
          </p>
        </div>
        <button className="button outline">
          <LinkIcon size={16} /> Share
        </button>
      </div>
      <div className="detail-grid">
        <section className="detail-primary">
          <div className="status-banner">
            <span
              className={`status-tag ${ticket.status.toLowerCase().replace(" ", "-")}`}
            >
              {ticket.status}
            </span>
            <span className={`priority ${ticket.priority.toLowerCase()}`}>
              {ticket.priority} priority
            </span>
            {ticket.assignee && (
              <span className="assignee">
                <UserRound size={14} />{" "}
                {ticket.assignee === username
                  ? "Assigned to you"
                  : ticket.assignee}
              </span>
            )}
          </div>
          <article className="content-section">
            <h2>Description</h2>
            <p>{ticket.description}</p>
          </article>
          <article className="content-section">
            <h2>Completion criteria</h2>
            <ul className="criteria">
              {ticket.criteria.map((item) => (
                <li key={item}>
                  <span>
                    <Check size={14} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </article>
          {ticket.resources.length > 0 && (
            <article className="content-section">
              <h2>Resources</h2>
              {ticket.resources.map((resource) => (
                <a
                  className="resource-link"
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  key={resource.url}
                >
                  <LinkIcon size={15} /> {resource.label}
                </a>
              ))}
            </article>
          )}
          <article className="content-section">
            <h2>
              Comments <span>{ticket.comments.length}</span>
            </h2>
            <form className="comment-form" onSubmit={postComment}>
              <textarea
                aria-label="Add a comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share a progress note or question..."
                rows={3}
              />
              <button className="button primary" type="submit">
                Post comment
              </button>
            </form>
            {ticket.comments.map((item) => (
              <div className="comment" key={item.id}>
                <span className="avatar">
                  {item.author.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{item.author}</strong>
                  <small>{formatDate(item.createdAt)}</small>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </article>
        </section>
        <aside className="detail-aside">
          <div className="action-card">
            <h2>Work on this</h2>
            {canClaim ? (
              <button className="button primary full" onClick={onClaim}>
                Claim ticket
              </button>
            ) : mine ? (
              <>
                <p className="success-note">
                  <Check size={15} /> This ticket is assigned to you.
                </p>
                <button
                  className="button outline full"
                  onClick={() =>
                    onUpdate(
                      ticket.id,
                      { status: "Blocked" },
                      "marked this ticket blocked",
                    )
                  }
                >
                  Mark blocked
                </button>
                <button
                  className="button outline full"
                  onClick={() =>
                    onUpdate(
                      ticket.id,
                      { status: "In Review" },
                      "submitted this ticket for review",
                    )
                  }
                >
                  Submit for review
                </button>
              </>
            ) : (
              <p className="muted">
                This ticket is currently owned by{" "}
                {ticket.assignee || "another teammate"}.
              </p>
            )}
          </div>
          {mine && ticket.status !== "Done" && (
            <div className="action-card">
              <h2>Submit summary</h2>
              <textarea
                aria-label="Completion summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="What changed? What should the reviewer verify?"
                rows={4}
              />
              <button
                className="button outline full"
                onClick={() => {
                  if (summary.trim())
                    onUpdate(
                      ticket.id,
                      { status: "In Review" },
                      "submitted work for review",
                    );
                  setSummary("");
                }}
              >
                Submit with summary
              </button>
            </div>
          )}
          <div className="meta-card">
            <Meta
              icon={<Users size={15} />}
              label="Subteam"
              value={ticket.subteam}
            />
            <Meta
              icon={<CalendarDays size={15} />}
              label="Due date"
              value={formatDate(ticket.dueDate)}
            />
            <Meta
              icon={<Clock3 size={15} />}
              label="Estimate"
              value={ticket.effort || "Not estimated"}
            />
          </div>
          <div className="activity">
            <h2>
              <ActivityIcon size={16} /> Activity
            </h2>
            {ticket.activity.slice(0, 5).map((item) => (
              <div className="activity-item" key={item.id}>
                <span className="activity-line" />
                <p>
                  <strong>{item.actor}</strong> {item.message}
                  <small>{formatDate(item.createdAt)}</small>
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="meta-row">
      {icon}
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function LeadOverviewBase({
  tickets,
  onCreateTicket,
}: {
  tickets: Ticket[];
  onCreateTicket: () => void;
}) {
  const [showDateRange, setShowDateRange] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const rangeTickets = tickets.filter((ticket) => {
    const updated = ticket.updatedAt.slice(0, 10);
    return (!rangeStart || updated >= rangeStart) && (!rangeEnd || updated <= rangeEnd);
  });
  const summaryTickets = rangeStart || rangeEnd ? rangeTickets : tickets;
  const counts = [
    {
      label: "Unassigned",
      value: summaryTickets.filter((t) => !t.assignee && t.status === "Open").length,
      icon: <Users />,
    },
    {
      label: "Blocked",
      value: summaryTickets.filter((t) => t.status === "Blocked").length,
      icon: <CircleAlert />,
    },
    {
      label: "Awaiting review",
      value: summaryTickets.filter((t) => t.status === "In Review").length,
      icon: <Clock3 />,
    },
    {
      label: "Completed",
      value: summaryTickets.filter((t) => t.status === "Done").length,
      icon: <Check />,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LEAD VIEW / TEAM PULSE</p>
          <h1>Lead overview</h1>
          <p className="muted">A quick read for the next online meeting.</p>
        </div>
        <div className="heading-actions">
          <button className="button outline" onClick={() => setShowDateRange((current) => !current)}>
            <CalendarDays size={16} /> Date range
          </button>
          <button className="button primary" onClick={onCreateTicket}>
            <Plus size={16} /> New ticket
          </button>
        </div>
      </div>
      {showDateRange && <div className="date-range-panel"><label>From<input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label><label>To<input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label><button className="text-button" onClick={() => { setRangeStart(""); setRangeEnd(""); }}>Clear</button></div>}
      <div className="overview-grid">
        {counts.map((item) => (
          <div className="overview-card" key={item.label}>
            <span>{item.icon}</span>
            <strong>{item.value}</strong>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
      <div className="meeting-note">
        <div>
          <p className="eyebrow">RHYTHM</p>
          <h2>Progress summary</h2>
          <p>
            Use the date-range control to prepare a two-week online meeting
            summary. Weekly drop-in lab hours are Wednesdays, 3–5 PM.
          </p>
        </div>
        <div className="meeting-date">
          <CalendarDays size={20} />
          <strong>Next review window</strong>
          <span>{rangeStart || rangeEnd ? `${rangeStart || "Any date"} to ${rangeEnd || "Any date"}` : "Choose a date range"}</span>
        </div>
      </div>
      <div className="lead-table">
        <div className="table-head">
          <span>Ticket</span>
          <span>Status</span>
          <span>Owner</span>
          <span>Updated</span>
        </div>
        {summaryTickets
          .filter((t) => t.status === "Blocked" || t.status === "In Review")
          .map((t) => (
            <div className="table-row" key={t.id}>
              <span>
                <b>{t.id}</b>
                {t.title}
              </span>
              <span
                className={`status-tag ${t.status.toLowerCase().replace(" ", "-")}`}
              >
                {t.status}
              </span>
              <span>{t.assignee || "Unassigned"}</span>
              <span>{formatDate(t.updatedAt)}</span>
            </div>
          ))}
      </div>
    </>
  );
}
function AdminView() {
  const [roster, setRoster] = useState<LeadRosterEntry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadLeadRoster()
      .then(setRoster)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION / ACCESS</p>
          <h1>Lead access</h1>
          <p className="muted">
            Lead authorization and subteam scopes from Supabase.
          </p>
        </div>
      </div>
      <div className="admin-warning">
        <ShieldCheck size={22} />
        <div>
          <h2>Permissioned workspace</h2>
          <p>
            Discord usernames are display identities only. Lead permissions come
            from explicitly authorized Supabase accounts and are enforced by
            database policies. To add a lead, create the account under Supabase
            Authentication &gt; Users, then insert its UID into{" "}
            <code>public.leads</code> (and <code>public.lead_scopes</code> for
            subteam leads) in the SQL editor.
          </p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="lead-table">
        <div className="table-head">
          <span>Lead account</span>
          <span>Role</span>
          <span>Scopes</span>
          <span>Added</span>
        </div>
        {roster === null && !error && (
          <div className="table-row">
            <span>Loading lead accounts...</span>
          </div>
        )}
        {roster?.map((lead) => (
          <div className="table-row" key={lead.userId}>
            <span>
              <b>{lead.displayName || "Lead account"}</b>
              <small>{lead.userId}</small>
            </span>
            <span>
              {lead.role === "administrator" ? "Administrator" : "Subteam lead"}
            </span>
            <span>
              {lead.role === "administrator"
                ? "All subteams"
                : lead.scopes.join(" · ") || "No scopes"}
            </span>
            <span>{formatDate(lead.createdAt)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ReviewQueueView({
  tickets,
  openTicket,
  onDecision,
}: {
  tickets: Ticket[];
  openTicket: (id: string) => void;
  onDecision: (ticket: Ticket, status: Status) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function decide(ticket: Ticket, status: Status) {
    setBusyId(ticket.id);
    setError("");
    try {
      await onDecision(ticket, status);
    } catch (reason) {
      setError(`${ticket.id}: ${errorMessage(reason, "Unable to update ticket.")}`);
    } finally {
      setBusyId(null);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LEAD VIEW / REVIEW</p>
          <h1>Review queue</h1>
          <p className="muted">
            Work submitted for review in your subteams, oldest first. Completed
            tickets move to the archive.
          </p>
        </div>
        <div className="heading-meta">
          <span>
            <strong>{tickets.length}</strong> awaiting review
          </span>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="ticket-list">
        {tickets.map((ticket) => {
          const people = participantsFor(ticket);
          return (
            <div className="review-row" key={ticket.id}>
              <button className="review-main" onClick={() => openTicket(ticket.id)}>
                <span className="ticket-id">
                  {ticket.id}
                  {ticket.parentTicketId && <> · sub-ticket of {ticket.parentTicketId}</>}
                </span>
                <strong>{ticket.title}</strong>
                <span className="review-meta">
                  {ticket.subteam} ·{" "}
                  {people.length
                    ? people.map((person) => person.username).join(", ")
                    : "No participants"}{" "}
                  · submitted {formatDate(ticket.updatedAt)}
                </span>
              </button>
              <div className="review-actions">
                <button
                  className="button outline"
                  disabled={busyId === ticket.id}
                  onClick={() => void decide(ticket, "In Progress")}
                >
                  Send back
                </button>
                <button
                  className="button primary"
                  disabled={busyId === ticket.id}
                  onClick={() => void decide(ticket, "Done")}
                >
                  <Check size={15} /> Mark complete
                </button>
              </div>
            </div>
          );
        })}
        {tickets.length === 0 && (
          <div className="empty-state">
            <ClipboardCheck size={28} />
            <h3>Nothing waiting for review.</h3>
            <p>Tickets appear here when members submit them for review.</p>
          </div>
        )}
      </div>
    </>
  );
}

function ArchiveView({
  tickets,
  openTicket,
  username,
}: {
  tickets: Ticket[];
  openTicket: (id: string) => void;
  username: string;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE / COMPLETED</p>
          <h1>Ticket archive</h1>
          <p className="muted">
            Tickets and sub-tickets a lead has marked complete.
          </p>
        </div>
        <div className="heading-meta">
          <span>
            <strong>{tickets.length}</strong> completed
          </span>
        </div>
      </div>
      <div className="ticket-list">
        {tickets.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            openTicket={openTicket}
            username={username}
          />
        ))}
        {tickets.length === 0 && (
          <div className="empty-state">
            <Archive size={28} />
            <h3>No completed tickets yet.</h3>
            <p>Work a lead marks complete will be listed here.</p>
          </div>
        )}
      </div>
    </>
  );
}
