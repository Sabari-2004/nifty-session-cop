import type { SessionPhase } from "./session";

export type DayState = {
  dateKey: string;
  orHigh: string;
  orLow: string;
  spot: string;
  lotSize: string;
  maxRiskRs: string;
  realizedR: number;
  usedTrade: boolean;
  openTrade: boolean;
};

export type Verdict = {
  allowed: boolean;
  code: "TRADE" | "SKIP";
  reasons: string[];
  orWidth: number | null;
  oneRRupees: number | null;
  stopLong: number | null;
  stopShort: number | null;
  t1Long: number | null;
  t2Long: number | null;
  t1Short: number | null;
  t2Short: number | null;
};

const TINY_OR = 25;
const TARGET_R = 1.75;

export function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function evaluate(state: DayState, phase: SessionPhase): Verdict {
  const reasons: string[] = [];
  const high = num(state.orHigh);
  const low = num(state.orLow);
  const lot = num(state.lotSize) ?? 65;
  const maxRs = num(state.maxRiskRs) ?? 2000;

  const orWidth =
    high != null && low != null && high > low ? high - low : null;
  const oneRRupees = orWidth != null ? orWidth * lot : null;

  if (phase === "weekend" || phase === "closed") {
    reasons.push("Session is closed.");
  }
  if (phase === "mark_or") {
    reasons.push("Opening range is still forming. No orders before 09:30.");
  }
  if (phase === "no_new") {
    reasons.push("Trade window ended at 11:30. No new risk.");
  }
  if (phase === "cas") {
    reasons.push(
      "CAS / closing auction. This is settlement, not a Nifty scalp. Stay flat.",
    );
  }
  if (state.openTrade) {
    reasons.push("One position already open. No add. No second ticker.");
  }
  if (state.usedTrade && !state.openTrade) {
    reasons.push("Today's one attempt is used.");
  }
  if (state.realizedR <= -1) {
    reasons.push("Daily stop: −1R hit. Locked.");
  }
  if (state.realizedR >= 2) {
    reasons.push("Daily target: +2R hit. Locked. Walk away.");
  }
  if (orWidth == null) {
    reasons.push("Mark OR high and OR low (first 15 minutes). High must be above low.");
  } else {
    if (orWidth < TINY_OR) {
      reasons.push(
        `Opening range is tiny (${orWidth.toFixed(1)} pts). Skip — chop day.`,
      );
    }
    if (oneRRupees != null && oneRRupees > maxRs) {
      reasons.push(
        `1R is ₹${Math.round(oneRRupees)} (range × lot). Above your max ₹${maxRs}. Skip or cut lot.`,
      );
    }
  }

  const allowed =
    phase === "window" &&
    !state.openTrade &&
    !state.usedTrade &&
    state.realizedR > -1 &&
    state.realizedR < 2 &&
    orWidth != null &&
    orWidth >= TINY_OR &&
    oneRRupees != null &&
    oneRRupees <= maxRs;

  if (allowed) {
    reasons.unshift(
      "Window open. Wait for a 5-minute close beyond OR. Stop = other side of the range (1R). Target 1.5–2R. No chase.",
    );
  }

  return {
    allowed,
    code: allowed ? "TRADE" : "SKIP",
    reasons,
    orWidth,
    oneRRupees,
    stopLong: low,
    stopShort: high,
    t1Long: high != null && orWidth != null ? high + orWidth * 1.5 : null,
    t2Long: high != null && orWidth != null ? high + orWidth * TARGET_R : null,
    t1Short: low != null && orWidth != null ? low - orWidth * 1.5 : null,
    t2Short: low != null && orWidth != null ? low - orWidth * TARGET_R : null,
  };
}
