export type Bar = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Quote = {
  last: number;
  bars: Bar[];
  source: string;
  angel?: boolean;
};

export async function fetchNifty(): Promise<Quote> {
  const res = await fetch("/api/nifty", { cache: "no-store" });
  if (!res.ok) throw new Error("feed");
  return res.json() as Promise<Quote>;
}

function istClockFromUnix(ts: number): { h: number; m: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    h: Number(get("hour")),
    m: Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function orFromBars(bars: Bar[], dateKey: string): { high: number; low: number } | null {
  const slice = bars.filter((b) => {
    const c = istClockFromUnix(b.t);
    if (c.dateKey !== dateKey) return false;
    const mins = c.h * 60 + c.m;
    return mins >= 9 * 60 + 15 && mins < 9 * 60 + 30;
  });
  if (!slice.length) return null;
  return {
    high: Math.max(...slice.map((b) => b.high)),
    low: Math.min(...slice.map((b) => b.low)),
  };
}

export function lastClosedBar(bars: Bar[], now = new Date()): Bar | null {
  const cutoff = now.getTime() / 1000 - 5 * 60;
  const done = bars.filter((b) => b.t <= cutoff);
  return done.at(-1) ?? null;
}
