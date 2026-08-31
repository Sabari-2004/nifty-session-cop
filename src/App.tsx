import { FormEvent, useEffect, useMemo, useState } from "react";
import Chart from "./components/Chart";
import { atmLabel } from "./lib/atm";
import { evaluate, num, type DayState } from "./lib/gates";
import {
  loadJournal,
  saveJournal,
  stats,
  type JournalTrade,
  type Side,
} from "./lib/journal";
import { PHASE_COPY, readIst, sessionPhase } from "./lib/session";

const SETTINGS_KEY = "nifty-session-cop.day.v1";

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

export default function App() {
  const [clock, setClock] = useState(() => readIst());
  const [day, setDay] = useState<DayState>(() => loadDay(readIst().dateKey));
  const [journal, setJournal] = useState<JournalTrade[]>(() => loadJournal());
  const [side, setSide] = useState<Side>("LONG");
  const [entry, setEntry] = useState("");
  const [exitPx, setExitPx] = useState("");
  const [followed, setFollowed] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const t = window.setInterval(() => setClock(readIst()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setDay((d) => {
      if (d.dateKey === clock.dateKey) return d;
      return emptyDay(clock.dateKey);
    });
  }, [clock.dateKey]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(day));
  }, [day]);

  const phase = sessionPhase(clock);
  const copy = PHASE_COPY[phase];
  const verdict = useMemo(() => evaluate(day, phase), [day, phase]);
  const summary = useMemo(() => stats(journal), [journal]);
  const spotN = num(day.spot);
  const label = atmLabel(spotN ?? 0, side);

  const phaseClass =
    phase === "window" && verdict.allowed
      ? "trade"
      : phase === "cas" || phase === "no_new"
        ? "skip"
        : "warn";

  function patch(p: Partial<DayState>) {
    setDay((d) => ({ ...d, ...p }));
  }

  function onJournal(e: FormEvent) {
    e.preventDefault();
    const ent = num(entry);
    const ex = num(exitPx);
    const stop = side === "LONG" ? verdict.stopLong : verdict.stopShort;
    if (ent == null || ex == null || stop == null) return;
    const risk = Math.abs(ent - stop);
    if (risk <= 0) return;
    const r =
      side === "LONG" ? (ex - ent) / risk : (ent - ex) / risk;
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
    const next = [row, ...journal];
    setJournal(next);
    saveJournal(next);
    patch({
      openTrade: false,
      usedTrade: true,
      realizedR: Number((day.realizedR + row.r).toFixed(2)),
    });
    setEntry("");
    setExitPx("");
    setNotes("");
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Nifty Session Cop</h1>
          <p>One index. One R. Flat before CAS. Not a signal bot.</p>
        </div>
        <div className="clock">
          <div className="time">{clock.display}</div>
          <span className={`phase ${phaseClass}`}>{copy.label}</span>
        </div>
      </header>

      {phase === "cas" && (
        <div className="cas">
          CAS is live (cash CTS ended ~15:15; auction into ~15:35). Do not
          hunt F&amp;O stocks or open new Nifty risk. Closing auction is
          settlement, not a 3% scalp.
        </div>
      )}

      <div className="grid">
        <section className="panel">
          <h2>NSE:NIFTY · 5 MIN · TRADINGVIEW</h2>
          <Chart />
        </section>

        <section className="panel">
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
                <label>SPOT (FOR ATM LABEL)</label>
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
            {!verdict.allowed && (
              <div className="locked-note">
                Order button stays locked until every gate passes.
              </div>
            )}

            <div className="actions">
              <button
                className="primary"
                disabled={!verdict.allowed}
                onClick={() => patch({ openTrade: true, usedTrade: true })}
              >
                Mark in (locks book)
              </button>
              <button
                disabled={!day.openTrade}
                onClick={() => patch({ openTrade: false })}
              >
                Still flat / aborted
              </button>
              <button
                className="danger"
                onClick={() =>
                  patch({
                    realizedR: -1,
                    openTrade: false,
                    usedTrade: true,
                  })
                }
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
              <input disabled value={side === "LONG" ? (verdict.stopLong ?? "") : (verdict.stopShort ?? "")} />
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
        Process tool only — not SEBI-registered advice, not a broker, not a
        profit guarantee. TradingView chart is an official embed. Journal lives
        in this browser (localStorage). UptimeRobot: ping{" "}
        <code>/health.txt</code> after Render deploy. If last-20 average R is
        ≤ 0 after costs, kill the rules — do not add indicators.
      </p>
    </div>
  );
}
