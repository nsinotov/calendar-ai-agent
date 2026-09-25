const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface LocalParts {
  // "2026-09-25"
  date: string;
  // "08:30", 24-hour
  time: string;
  weekday: Weekday;
}

function formatParts(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function localParts(date: Date, timezone: string): LocalParts {
  const p = formatParts(date, timezone);

  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: (p.weekday ?? "").toLowerCase() as Weekday,
  };
}

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);

  return (hours ?? 0) * 60 + (minutes ?? 0);
}

// Offset of the timezone from UTC at the given instant, in milliseconds.
function offsetMs(date: Date, timezone: string): number {
  const p = formatParts(date, timezone);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));

  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The instant a local calendar day ("2026-09-25") starts in the timezone.
export function startOfLocalDay(date: string, timezone: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  const first = new Date(guess.getTime() - offsetMs(guess, timezone));

  return new Date(guess.getTime() - offsetMs(first, timezone));
}

export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);

  return moved.toISOString().slice(0, 10);
}

// True when the local clock is between `time` and `time` + `graceMinutes` (same day).
export function inWindow(local: LocalParts, time: string, graceMinutes: number): boolean {
  const elapsed = minutesOfDay(local.time) - minutesOfDay(time);

  return elapsed >= 0 && elapsed <= graceMinutes;
}

