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
};

const YAHOO =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=5m&range=1d&includePrePost=false";

async function readJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function parseYahoo(raw: unknown): Quote | null {
  const chart = (raw as { chart?: { result?: unknown[] } }).chart;
  const result = chart?.result?.[0] as
    | {
        timestamp?: number[];
        meta?: { regularMarketPrice?: number };
        indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[] }> };
      }
    | undefined;
  if (!result?.timestamp?.length) return null;
  const q = result.indicators?.quote?.[0];
  if (!q) return null;
  const bars: Bar[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = q.close?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const open = q.open?.[i];
    if (
      close == null ||
      high == null ||
      low == null ||
      open == null ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    bars.push({ t: result.timestamp[i], open, high, low, close });
  }
  const last =
    result.meta?.regularMarketPrice ?? bars.at(-1)?.close ?? null;
  if (last == null || !bars.length) return null;
  return { last, bars, source: "Yahoo ^NSEI (delayed)" };
}

export async function fetchNifty(): Promise<Quote> {
  try {
    const direct = await readJson(YAHOO);
    const parsed = parseYahoo(direct);
    if (parsed) return parsed;
  } catch {
    /* CORS from the browser is common */
  }

  const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(YAHOO)}`;
  const raw = await readJson(proxied);
  const parsed = parseYahoo(raw);
  if (!parsed) throw new Error("No Nifty quote");
  return { ...parsed, source: "Yahoo ^NSEI via proxy (delayed)" };
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

/** First 15 minutes: 09:15, 09:20, 09:25 bars. */
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

/** Last 5-min bar that has already closed (bar start + 5m). */
export function lastClosedBar(bars: Bar[], now = new Date()): Bar | null {
  const cutoff = now.getTime() / 1000 - 5 * 60;
  const done = bars.filter((b) => b.t <= cutoff);
  return done.at(-1) ?? null;
}
