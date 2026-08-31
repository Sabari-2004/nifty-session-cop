export type SessionPhase =
  | "weekend"
  | "closed"
  | "mark_or"
  | "window"
  | "no_new"
  | "cas";

export type IstClock = {
  dateKey: string;
  weekday: string;
  hours: number;
  minutes: number;
  seconds: number;
  minutesOfDay: number;
  display: string;
  isWeekend: boolean;
};

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

export function readIst(now = new Date()): IstClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = part(parts, "weekday");
  const hours = Number(part(parts, "hour"));
  const minutes = Number(part(parts, "minute"));
  const seconds = Number(part(parts, "second"));
  const dateKey = `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  return {
    dateKey,
    weekday,
    hours,
    minutes,
    seconds,
    minutesOfDay: hours * 60 + minutes,
    display: `${weekday} ${dateKey}  ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} IST`,
    isWeekend,
  };
}

export function sessionPhase(clock: IstClock): SessionPhase {
  if (clock.isWeekend) return "weekend";
  const t = clock.minutesOfDay;
  if (t >= 9 * 60 + 15 && t < 9 * 60 + 30) return "mark_or";
  if (t >= 9 * 60 + 30 && t < 11 * 60 + 30) return "window";
  if (t >= 11 * 60 + 30 && t < 15 * 60 + 15) return "no_new";
  if (t >= 15 * 60 + 15 && t < 15 * 60 + 40) return "cas";
  return "closed";
}

export const PHASE_COPY: Record<
  SessionPhase,
  { label: string; hint: string }
> = {
  weekend: {
    label: "WEEKEND",
    hint: "Market closed. Review journal. Do not invent trades.",
  },
  closed: {
    label: "CLOSED",
    hint: "No Nifty session. Plan tomorrow. Stay flat.",
  },
  mark_or: {
    label: "MARK OPENING RANGE",
    hint: "09:15–09:30. Chart only. No orders.",
  },
  window: {
    label: "TRADE WINDOW",
    hint: "09:30–11:30. One Nifty attempt. 5-min close beyond OR.",
  },
  no_new: {
    label: "NO NEW RISK",
    hint: "After 11:30. Flatten. Do not hunt. Most of the day range is in.",
  },
  cas: {
    label: "CAS — DO NOT TRADE",
    hint: "Cash CTS ended. Closing auction 15:15–15:35. Not a scalp. Stay out of stocks and new Nifty risk.",
  },
};
