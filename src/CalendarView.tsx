import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Ticket } from "./types";
import {
  calendarDays,
  isOverdue,
  teamTodayKey,
  ticketsByDueDate,
  toDateKey,
} from "./domain";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Days show this many tickets before collapsing the rest behind "+N more".
const visiblePerDay = 3;

export function CalendarView({
  tickets,
  openTicket,
}: {
  tickets: Ticket[];
  openTicket: (id: string) => void;
}) {
  // "Today" follows Pacific time so the highlight matches the team's day.
  const todayKey = teamTodayKey();
  const [todayYear, todayMonth] = todayKey.split("-").map(Number);
  const today = { year: todayYear, month: todayMonth - 1 };
  const [month, setMonth] = useState({
    ...today,
  });
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const byDay = useMemo(() => ticketsByDueDate(tickets), [tickets]);
  const days = calendarDays(month.year, month.month);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(month.year, month.month, 1));
  const monthDays = days.filter((day) => day.getMonth() === month.month);
  const dueThisMonth = monthDays.reduce(
    (count, day) => count + (byDay.get(toDateKey(day))?.length || 0),
    0,
  );
  const overdue = tickets.filter((ticket) => isOverdue(ticket, todayKey));
  const undated = tickets.filter(
    (ticket) => !ticket.dueDate && ticket.status !== "Done",
  ).length;

  function shiftMonth(offset: number) {
    setExpandedDay(null);
    setMonth((current) => {
      const next = new Date(current.year, current.month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE / SCHEDULE</p>
          <h1>Calendar</h1>
          <p className="muted">
            Ticket and sub-ticket due dates. Select a ticket to open it.
          </p>
        </div>
        <div className="heading-meta">
          <span>
            <strong>{dueThisMonth}</strong> due this month
          </span>
          <span>
            <strong>{overdue.length}</strong> overdue
          </span>
          <span>
            <strong>{undated}</strong> without a due date
          </span>
        </div>
      </div>
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button
            className="button outline"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 aria-live="polite">{monthLabel}</h2>
          <button
            className="button outline"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          className="button outline"
          onClick={() => {
            setExpandedDay(null);
            setMonth(today);
          }}
        >
          Today
        </button>
      </div>
      <div className="calendar-grid">
        {weekdays.map((day) => (
          <div className="calendar-weekday" key={day}>
            {day}
          </div>
        ))}
        {days.map((day) => {
          const key = toDateKey(day);
          const dayTickets = byDay.get(key) || [];
          const outside = day.getMonth() !== month.month;
          const expanded = expandedDay === key;
          const shown = expanded
            ? dayTickets
            : dayTickets.slice(0, visiblePerDay);
          const hidden = dayTickets.length - shown.length;
          const classes = [
            "calendar-day",
            outside && "outside",
            key === todayKey && "today",
            dayTickets.length === 0 && "empty",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div className={classes} key={key}>
              <span className="calendar-date">
                <span className="calendar-date-weekday">
                  {weekdays[day.getDay()]}{" "}
                </span>
                {day.getDate()}
              </span>
              {shown.map((ticket) => (
                <CalendarChip
                  key={ticket.id}
                  ticket={ticket}
                  overdue={isOverdue(ticket, todayKey)}
                  openTicket={openTicket}
                />
              ))}
              {hidden > 0 && (
                <button
                  className="calendar-more"
                  onClick={() => setExpandedDay(key)}
                >
                  +{hidden} more
                </button>
              )}
              {expanded && dayTickets.length > visiblePerDay && (
                <button
                  className="calendar-more"
                  onClick={() => setExpandedDay(null)}
                >
                  Show less
                </button>
              )}
            </div>
          );
        })}
      </div>
      {dueThisMonth === 0 && (
        <div className="empty-state calendar-empty">
          <CalendarDays size={28} />
          <h3>Nothing is due in {monthLabel}.</h3>
          <p>Leads can set due dates when creating or editing a ticket.</p>
        </div>
      )}
      {overdue.length > 0 && (
        <section className="calendar-overdue">
          <h2>Overdue</h2>
          {overdue
            .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
            .map((ticket) => (
              <CalendarChip
                key={ticket.id}
                ticket={ticket}
                overdue
                showDate
                openTicket={openTicket}
              />
            ))}
        </section>
      )}
    </>
  );
}

function CalendarChip({
  ticket,
  overdue,
  showDate,
  openTicket,
}: {
  ticket: Ticket;
  overdue: boolean;
  showDate?: boolean;
  openTicket: (id: string) => void;
}) {
  const status = ticket.status.toLowerCase().replace(" ", "-");
  return (
    <button
      className={`calendar-chip ${status}${overdue ? " overdue" : ""}`}
      onClick={() => openTicket(ticket.id)}
      title={`${ticket.id} · ${ticket.title} · ${ticket.status}${overdue ? " · overdue" : ""}`}
    >
      <span className="calendar-chip-id">
        {showDate && ticket.dueDate
          ? `${ticket.dueDate.slice(5, 10).replace("-", "/")} · `
          : ""}
        {ticket.id}
      </span>
      <span className="calendar-chip-title">{ticket.title}</span>
    </button>
  );
}
