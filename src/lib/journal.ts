export type Side = "LONG" | "SHORT";

export type JournalTrade = {
  id: string;
  dateKey: string;
  side: Side;
  entry: number;
  stop: number;
  exit: number;
  r: number;
  followedPlan: boolean;
  notes: string;
  createdAt: string;
};

const KEY = "nifty-session-cop.journal.v1";

export function loadJournal(): JournalTrade[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JournalTrade[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJournal(rows: JournalTrade[]): void {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export function stats(rows: JournalTrade[]) {
  const n = rows.length;
  if (!n) {
    return { n: 0, avgR: 0, followedPct: 0, last20AvgR: 0 };
  }
  const sum = rows.reduce((a, t) => a + t.r, 0);
  const followed = rows.filter((t) => t.followedPlan).length;
  const last20 = rows.slice(0, 20);
  const last20Avg =
    last20.reduce((a, t) => a + t.r, 0) / last20.length;
  return {
    n,
    avgR: sum / n,
    followedPct: (followed / n) * 100,
    last20AvgR: last20Avg,
  };
}
