/** Next Nifty weekly expiry: Thursday (IST). If Thursday already past session, next week. */
export function nextWeeklyExpiry(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = map[wd] ?? now.getDay();
  const add = (4 - dow + 7) % 7;
  const expiry = new Date(Date.UTC(y, m - 1, d + add));
  return expiry;
}

export function formatExpiry(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function atmLabel(spot: number, side: "LONG" | "SHORT" | null): string {
  if (!Number.isFinite(spot) || spot <= 0) return "Enter spot for ATM name";
  const strike = Math.round(spot / 50) * 50;
  const opt = side === "SHORT" ? "PE" : "CE";
  const exp = formatExpiry(nextWeeklyExpiry());
  return `NIFTY ${strike} ${opt} · ${exp}`;
}
