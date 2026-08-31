import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart from "./components/Chart";
import { atmLabel } from "./lib/atm";
import { evaluate, num, type DayState, type Verdict } from "./lib/gates";
import {
  loadJournal,
  saveJournal,
  stats,
  type JournalTrade,
  type Side,
} from "./lib/journal";
import { fetchNifty, lastClosedBar, orFromBars, type Bar } from "./lib/quotes";
import { PHASE_COPY, readIst, sessionPhase, type SessionPhase } from "./lib/session";

const SETTINGS_KEY = "nifty-session-cop.day.v1";
const AUTO_KEY = "nifty-session-cop.auto.v1";

type PaperPos = {
  side: Side;
  entry: number;
  stop: number;
  target: number;
};

type LogLine = { id: string; text: string };

function emptyDay(dateKey: string): DayState {
  return {
    dateKey,
    orHigh: "",
    orLow: "",
    spot: "",
    lotSize: "65",
    maxRiskRs: "2000",
    realizedR: 0,
    usedTrade: false,
    openTrade: false,
  };
}

function loadDay(dateKey: string): DayState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return emptyDay(dateKey);
    const parsed = JSON.parse(raw) as DayState;
    if (parsed.dateKey !== dateKey) return emptyDay(dateKey);
    return { ...emptyDay(dateKey), ...parsed, dateKey };
  } catch {
    return emptyDay(dateKey);
  }
}

function rMultiple(side: Side, entry: number, stop: number, exit: number): number {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return 0;
  return side === "LONG" ? (exit - entry) / risk : (entry - exit) / risk;
}

export default function App() {
  const [clock, setClock] = useState(() => readIst());
  const [day, setDay] = useState<DayState>(() => loadDay(readIst().dateKey));
  const [journal, setJournal] = useState<JournalTrade[]>(() => loadJournal());
  const [side, setSide] = useState<Side>("LONG");
  const [entry, setEntry] = useState("");
  const [exitPx, setExitPx] = useState("");
  const [followed, setFollowed] = useState(true);
  const [notes, setNotes] = useState("");
  const [autoOn, setAutoOn] = useState(() => localStorage.getItem(AUTO_KEY) === "1");
  const [lastPx, setLastPx] = useState<number | null>(null);
  const [feed, setFeed] = useState("No quote yet");
  const [bars, setBars] = useState<Bar[]>([]);
  const [angelOn, setAngelOn] = useState(false);
  const [paper, setPaper] = useState<PaperPos | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);

  const dayRef = useRef(day);
  const paperRef = useRef(paper);
  const journalRef = useRef(journal);
  const autoRef = useRef(autoOn);
  dayRef.current = day;
  paperRef.current = paper;
  journalRef.current = journal;
  autoRef.current = autoOn;

  const log = useCallback((text: string) => {
    const line = { id: crypto.randomUUID(), text: `${readIst().display}  ${text}` };
    setLogs((prev) => [line, ...prev].slice(0, 40));
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setClock(readIst()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setDay((d) => {
      if (d.dateKey === clock.dateKey) return d;
      setPaper(null);
      return emptyDay(clock.dateKey);
    });
  }, [clock.dateKey]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(day));
  }, [day]);

  useEffect(() => {
    localStorage.setItem(AUTO_KEY, autoOn ? "1" : "0");
  }, [autoOn]);

  const phase = sessionPhase(clock);
  const copy = PHASE_COPY[phase];
  const verdict = useMemo(() => evaluate(day, phase), [day, phase]);
  const summary = useMemo(() => stats(journal), [journal]);
  const spotN = num(day.spot) ?? lastPx;
  const label = atmLabel(spotN ?? 0, paper?.side ?? side);

  const phaseClass =
    phase === "window" && verdict.allowed
      ? "trade"
      : phase === "cas" || phase === "no_new"
        ? "skip"
        : "warn";

  function patch(p: Partial<DayState>) {
    setDay((d) => ({ ...d, ...p }));
  }

  function pushJournal(row: JournalTrade) {
    const next = [row, ...journalRef.current];
    journalRef.current = next;
    setJournal(next);
    saveJournal(next);
  }

  function closePaper(exit: number, why: string, d: DayState, pos: PaperPos) {
    const r = Number(rMultiple(pos.side, pos.entry, pos.stop, exit).toFixed(2));
    pushJournal({
      id: crypto.randomUUID(),
      dateKey: d.dateKey,
      side: pos.side,
      entry: pos.entry,
      stop: pos.stop,
      exit,
      r,
      followedPlan: true,
      notes: `PAPER AUTO · ${why}`,
      createdAt: new Date().toISOString(),
    });
    setPaper(null);
    paperRef.current = null;
    const realized = Number((d.realizedR + r).toFixed(2));
    const nextDay = {
      ...d,
      openTrade: false,
      usedTrade: true,
      realizedR: realized,
    };
    dayRef.current = nextDay;
    setDay(nextDay);
    log(`FLAT ${pos.side} @ ${exit.toFixed(1)} · ${r.toFixed(2)}R · ${why}`);
  }

  function openPaper(nextSide: Side, fill: number, v: Verdict, d: DayState) {
    const stop = nextSide === "LONG" ? v.stopLong : v.stopShort;
    const target = nextSide === "LONG" ? v.t2Long : v.t2Short;
    if (stop == null || target == null) return;
    const pos: PaperPos = { side: nextSide, entry: fill, stop, target };
    setPaper(pos);
    paperRef.current = pos;
    setSide(nextSide);
    const nextDay = { ...d, openTrade: true, usedTrade: true, spot: String(fill) };
    dayRef.current = nextDay;
    setDay(nextDay);
    log(
      `FILL ${nextSide} @ ${fill.toFixed(1)} · SL ${stop.toFixed(1)} · TG ${target.toFixed(1)} · PAPER`,
    );
  }

  const quoteRef = useRef<{ last: number; bars: Bar[] } | null>(null);

  useEffect(() => {
    let alive = true;
    async function pull() {
      try {
        const [q, h] = await Promise.all([
          fetchNifty(),
          fetch("/api/health").then((r) => r.json()).catch(() => null),
        ]);
        if (!alive) return;
        setLastPx(q.last);
        setFeed(q.source);
        setBars(q.bars);
        setAngelOn(Boolean(q.angel || h?.angelConfigured));
        quoteRef.current = { last: q.last, bars: q.bars };
        setDay((cur) =>
          cur.spot.trim() ? cur : { ...cur, spot: String(Math.round(q.last * 10) / 10) },
        );
      } catch {
        if (alive) setFeed("No server feed. Deploy as Web Service (not Static).");
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function tick() {
      if (!autoRef.current || !alive) return;
      const d = dayRef.current;
      const q = quoteRef.current;
      if (!q) return;
      const ph: SessionPhase = sessionPhase(readIst());
      try {
        const or = orFromBars(q.bars, d.dateKey);
        if (or && !d.orHigh.trim() && !d.orLow.trim() && ph !== "mark_or") {
          const next = {
            ...dayRef.current,
            orHigh: or.high.toFixed(1),
            orLow: or.low.toFixed(1),
          };
          dayRef.current = next;
          setDay(next);
          log(`OR marked from 09:15–09:30 bars  ${or.high.toFixed(1)} / ${or.low.toFixed(1)}`);
        }

        const v = evaluate(dayRef.current, ph);
        const pos = paperRef.current;

        if (pos) {
          const hitSl =
            pos.side === "LONG" ? q.last <= pos.stop : q.last >= pos.stop;
          const hitTg =
            pos.side === "LONG" ? q.last >= pos.target : q.last <= pos.target;
          if (hitSl) {
            closePaper(pos.stop, "stop", dayRef.current, pos);
            return;
          }
          if (hitTg) {
            closePaper(pos.target, "target 1.75R", dayRef.current, pos);
            return;
          }
          if (ph === "no_new" || ph === "cas" || ph === "closed" || ph === "weekend") {
            closePaper(q.last, "time stop / session end", dayRef.current, pos);
          }
          return;
        }

        if (!v.allowed) return;
        const bar = lastClosedBar(q.bars);
        if (!bar) return;
        const high = num(dayRef.current.orHigh);
        const low = num(dayRef.current.orLow);
        if (high == null || low == null) return;
        if (bar.close > high) {
          openPaper("LONG", bar.close, v, dayRef.current);
        } else if (bar.close < low) {
          openPaper("SHORT", bar.close, v, dayRef.current);
        }
      } catch {
        /* keep scanning */
      }
    }

    const id = window.setInterval(() => void tick(), 5000);
    void tick();
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [autoOn, log]);

  function onJournal(e: FormEvent) {
    e.preventDefault();
    const ent = num(entry);
    const ex = num(exitPx);
    const stop = side === "LONG" ? verdict.stopLong : verdict.stopShort;
    if (ent == null || ex == null || stop == null) return;
    const r = rMultiple(side, ent, stop, ex);
    const row: JournalTrade = {
      id: crypto.randomUUID(),
      dateKey: day.dateKey,
      side,
      entry: ent,
      stop,
      exit: ex,
      r: Number(r.toFixed(2)),
      followedPlan: followed,
      notes,
      createdAt: new Date().toISOString(),
    };
    pushJournal(row);
    patch({
      openTrade: false,
      usedTrade: true,
      realizedR: Number((day.realizedR + row.r).toFixed(2)),
    });
    setPaper(null);
    setEntry("");
    setExitPx("");
    setNotes("");
  }

  const botClass = paper
    ? "in"
    : autoOn && verdict.allowed
      ? "armed"
      : autoOn
        ? "scan"
        : "flat";
  const botLabel = paper
    ? `IN ${paper.side} · PAPER`
    : autoOn && verdict.allowed
      ? "ARMED · WAITING 5m CLOSE"
      : autoOn
        ? "SCANNING · GATES CLOSED"
        : "AUTO OFF";

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Nifty Session Cop</h1>
          <p>
            Paper auto on Nifty. Live LTP via Angel if env is on the{" "}
            <strong>Web Service</strong>. Not a broker.
          </p>
        </div>
        <div className="clock">
          <div className="time">{clock.display}</div>
          <span className={`phase ${phaseClass}`}>{copy.label}</span>
        </div>
      </header>

      <div className="paper-warn">
        AUTO is <strong>paper</strong>. Angel env on a <strong>Static Site</strong> is
        ignored — convert to a Web Service. Same gates: one trade, 1R, flat into
        CAS.
      </div>

      {phase === "cas" && (
        <div className="cas">
          CAS is live. Auto will not open risk. Flatten if still in a paper
          trade.
        </div>
      )}

      <div className="grid">
        <section className="panel">
          <h2>NIFTY 50 · 5 MIN · LIVE FEED</h2>
          <Chart
            bars={bars}
            orHigh={num(day.orHigh)}
            orLow={num(day.orLow)}
          />
        </section>

        <section className="panel">
          <div className={`auto-bar ${autoOn ? "on" : ""}`}>
            <div>
              <div className={`bot-status ${botClass}`}>{botLabel}</div>
              <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 4 }}>
                Last {lastPx != null ? lastPx.toFixed(1) : "—"} · {feed}
                {angelOn ? " · Angel env present" : " · Angel not on this process"}
              </div>
            </div>
            <button
              className={autoOn ? "danger" : "primary"}
              type="button"
              onClick={() => {
                setAutoOn((v) => !v);
                log(autoOn ? "AUTO OFF" : "AUTO ON · paper engine");
              }}
            >
              {autoOn ? "Stop auto" : "Start auto (paper)"}
            </button>
          </div>
          <ul className="tape">
            {logs.length === 0 && <li>Engine idle. Start auto after OR is set (or let it mark OR).</li>}
            {logs.map((l) => (
              <li key={l.id}>{l.text}</li>
            ))}
          </ul>

          <div className={`verdict ${verdict.allowed ? "ok" : "no"}`}>
            <p className="code">{verdict.code}</p>
            <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
              {copy.hint}
            </p>
            <ul>
              {verdict.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>

          <div className="pad">
            <div className="row">
              <div>
                <label>OR HIGH (09:15–09:30)</label>
                <input
                  inputMode="decimal"
                  value={day.orHigh}
                  onChange={(e) => patch({ orHigh: e.target.value })}
                  placeholder="e.g. 24840"
                />
              </div>
              <div>
                <label>OR LOW</label>
                <input
                  inputMode="decimal"
                  value={day.orLow}
                  onChange={(e) => patch({ orLow: e.target.value })}
                  placeholder="e.g. 24770"
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <div>
                <label>SPOT / LAST</label>
                <input
                  inputMode="decimal"
                  value={day.spot}
                  onChange={(e) => patch({ spot: e.target.value })}
                  placeholder="Nifty last"
                />
              </div>
              <div>
                <label>LOT SIZE</label>
                <input
                  inputMode="numeric"
                  value={day.lotSize}
                  onChange={(e) => patch({ lotSize: e.target.value })}
                />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label>MAX 1R IN ₹</label>
              <input
                inputMode="numeric"
                value={day.maxRiskRs}
                onChange={(e) => patch({ maxRiskRs: e.target.value })}
              />
            </div>

            <div className="metrics">
              <div className="metric">
                <span>OR WIDTH</span>
                <strong>
                  {verdict.orWidth != null
                    ? `${verdict.orWidth.toFixed(1)} pts`
                    : "—"}
                </strong>
              </div>
              <div className="metric">
                <span>1R (RANGE × LOT)</span>
                <strong>
                  {verdict.oneRRupees != null
                    ? `₹${Math.round(verdict.oneRRupees)}`
                    : "—"}
                </strong>
              </div>
              <div className="metric">
                <span>DAY REALIZED R</span>
                <strong>{day.realizedR.toFixed(2)}R</strong>
              </div>
              <div className="metric">
                <span>OPEN / USED</span>
                <strong>
                  {day.openTrade ? "OPEN" : day.usedTrade ? "USED" : "FREE"}
                </strong>
              </div>
            </div>

            <div className="atm">{label}</div>
            {paper && (
              <div className="locked-note">
                Paper {paper.side} {paper.entry.toFixed(1)} → SL {paper.stop.toFixed(1)}{" "}
                TG {paper.target.toFixed(1)}
              </div>
            )}

            <div className="actions">
              <button
                className="primary"
                disabled={!verdict.allowed}
                onClick={() => patch({ openTrade: true, usedTrade: true })}
              >
                Mark in (manual lock)
              </button>
              <button
                disabled={!day.openTrade}
                onClick={() => {
                  patch({ openTrade: false });
                  setPaper(null);
                }}
              >
                Still flat / aborted
              </button>
              <button
                className="danger"
                onClick={() => {
                  patch({
                    realizedR: -1,
                    openTrade: false,
                    usedTrade: true,
                  });
                  setPaper(null);
                  log("Manual −1R lock");
                }}
              >
                Hit −1R (lock day)
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>JOURNAL IN R — NOT SCREENSHOTS</h2>
        <form className="pad" onSubmit={onJournal}>
          <div className="row">
            <div>
              <label>SIDE</label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as Side)}
              >
                <option value="LONG">LONG (CE / break OR high)</option>
                <option value="SHORT">SHORT (PE / break OR low)</option>
              </select>
            </div>
            <div>
              <label>ENTRY</label>
              <input
                required
                inputMode="decimal"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div>
              <label>
                STOP (AUTO = OTHER SIDE OF OR){" "}
                {side === "LONG"
                  ? verdict.stopLong ?? "—"
                  : verdict.stopShort ?? "—"}
              </label>
              <input
                disabled
                value={
                  side === "LONG"
                    ? (verdict.stopLong ?? "")
                    : (verdict.stopShort ?? "")
                }
              />
            </div>
            <div>
              <label>EXIT</label>
              <input
                required
                inputMode="decimal"
                value={exitPx}
                onChange={(e) => setExitPx(e.target.value)}
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div>
              <label>FOLLOWED PLAN?</label>
              <select
                value={followed ? "yes" : "no"}
                onChange={(e) => setFollowed(e.target.value === "yes")}
              >
                <option value="yes">Yes</option>
                <option value="no">No (chased / added / late)</option>
              </select>
            </div>
            <div>
              <label>NOTES</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="5-min close? chased?"
              />
            </div>
          </div>
          <p className="locked-note">
            Targets if OR is set — long T1/T2:{" "}
            {verdict.t1Long?.toFixed(1) ?? "—"} /{" "}
            {verdict.t2Long?.toFixed(1) ?? "—"} · short:{" "}
            {verdict.t1Short?.toFixed(1) ?? "—"} /{" "}
            {verdict.t2Short?.toFixed(1) ?? "—"}
          </p>
          <div className="actions">
            <button className="primary" type="submit">
              Save trade (computes R)
            </button>
          </div>
        </form>

        <div className="metrics" style={{ padding: "0 14px 8px" }}>
          <div className="metric">
            <span>TRADES</span>
            <strong>{summary.n}</strong>
          </div>
          <div className="metric">
            <span>AVG R</span>
            <strong>{summary.avgR.toFixed(2)}</strong>
          </div>
          <div className="metric">
            <span>PLAN FOLLOWED</span>
            <strong>{summary.followedPct.toFixed(0)}%</strong>
          </div>
          <div className="metric">
            <span>LAST 20 AVG R</span>
            <strong>{summary.last20AvgR.toFixed(2)}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Stop</th>
              <th>Exit</th>
              <th>R</th>
              <th>Plan</th>
            </tr>
          </thead>
          <tbody>
            {journal.slice(0, 20).map((t) => (
              <tr key={t.id}>
                <td>{t.dateKey}</td>
                <td>{t.side}</td>
                <td>{t.entry}</td>
                <td>{t.stop}</td>
                <td>{t.exit}</td>
                <td>{t.r.toFixed(2)}</td>
                <td>{t.followedPlan ? "yes" : "NO"}</td>
              </tr>
            ))}
            {journal.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>
                  No trades yet. Empty journal is a valid day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="foot">
        UptimeRobot: <code>/health.txt</code>. Check Angel:{" "}
        <code>/api/health</code> (shows configured yes/no, never secrets).
      </p>
    </div>
  );
}
