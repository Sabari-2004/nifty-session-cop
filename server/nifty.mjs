import { createHmac } from "node:crypto";

const NIFTY_TOKEN = "99926000";
const LOGIN =
  "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword";
const QUOTE =
  "https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/";
const CANDLES =
  "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData";
const YAHOO =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1m&range=1d&includePrePost=false";

let session = { jwt: "", ts: 0, lastError: "" };

function configured() {
  return Boolean(
    process.env.ANGEL_API_KEY &&
      process.env.ANGEL_CLIENT_ID &&
      process.env.ANGEL_PASSWORD &&
      process.env.ANGEL_TOTP_SECRET,
  );
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(input).replace(/[\s=-]/g, "").toUpperCase();
  let bits = "";
  for (const c of clean) {
    const v = alphabet.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

function angelHeaders(jwt = "") {
  const h = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": process.env.ANGEL_API_KEY || "",
  };
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  return h;
}

async function login() {
  const body = {
    clientcode: process.env.ANGEL_CLIENT_ID,
    password: process.env.ANGEL_PASSWORD,
    totp: totp(process.env.ANGEL_TOTP_SECRET || ""),
  };
  const res = await fetch(LOGIN, {
    method: "POST",
    headers: angelHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const jwt = json?.data?.jwtToken;
  if (!jwt) {
    session.lastError = json?.message || json?.errorcode || "login failed";
    throw new Error("angel login failed");
  }
  session = { jwt, ts: Date.now(), lastError: "" };
  return jwt;
}

async function jwtToken() {
  if (session.jwt && Date.now() - session.ts < 5 * 60 * 60 * 1000) {
    return session.jwt;
  }
  return login();
}

function to5m(bars1m) {
  const buckets = new Map();
  for (const b of bars1m) {
    const t = Math.floor(b.t / 300) * 300;
    const cur = buckets.get(t);
    if (!cur) {
      buckets.set(t, { t, open: b.open, high: b.high, low: b.low, close: b.close });
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

function parseYahoo(raw) {
  const result = raw?.chart?.result?.[0];
  if (!result?.timestamp?.length) return null;
  const q = result.indicators?.quote?.[0];
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = q.close?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const open = q.open?.[i];
    if (![close, high, low, open].every((n) => Number.isFinite(n))) continue;
    bars.push({ t: result.timestamp[i], open, high, low, close });
  }
  const last = result.meta?.regularMarketPrice ?? bars.at(-1)?.close;
  if (!bars.length || last == null) return null;
  return { last, bars1m: bars, bars5m: to5m(bars), source: "Yahoo ^NSEI 1m" };
}

async function yahooQuote() {
  const res = await fetch(YAHOO, {
    headers: { "User-Agent": "nifty-session-cop/1.0" },
  });
  if (!res.ok) throw new Error("yahoo " + res.status);
  return parseYahoo(await res.json());
}

function istStamp(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${g("year")}-${g("month")}-${g("day")}`,
    hm: `${g("hour")}:${g("minute")}`,
  };
}

async function angelLtpAndCandles() {
  const token = await jwtToken();
  const qRes = await fetch(QUOTE, {
    method: "POST",
    headers: angelHeaders(token),
    body: JSON.stringify({
      mode: "LTP",
      exchangeTokens: { NSE: [NIFTY_TOKEN] },
    }),
  });
  const qJson = await qRes.json();
  const fetched = qJson?.data?.fetched?.[0];
  const last = Number(fetched?.ltp);
  if (!Number.isFinite(last)) {
    session.lastError = qJson?.message || "no ltp";
    throw new Error("no ltp");
  }

  const { date } = istStamp();
  const cRes = await fetch(CANDLES, {
    method: "POST",
    headers: angelHeaders(token),
    body: JSON.stringify({
      exchange: "NSE",
      symboltoken: NIFTY_TOKEN,
      interval: "FIVE_MINUTE",
      fromdate: `${date} 09:15`,
      todate: `${date} 15:30`,
    }),
  });
  const cJson = await cRes.json();
  const raw = Array.isArray(cJson?.data) ? cJson.data : [];
  const bars5m = raw
    .map((row) => {
      const [ts, open, high, low, close] = row;
      const t = Math.floor(new Date(String(ts).replace(" ", "T") + "+05:30").getTime() / 1000);
      return { t, open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
    })
    .filter((b) => Number.isFinite(b.t) && Number.isFinite(b.close));

  return {
    last,
    bars5m,
    bars1m: bars5m,
    source: "Angel One SmartAPI (NIFTY 99926000)",
  };
}

export function status() {
  return {
    ok: true,
    angelConfigured: configured(),
    angelSession: Boolean(session.jwt),
    angelError: session.lastError ? "login_or_quote_failed" : "",
  };
}

export async function getNifty() {
  let yahoo = null;
  try {
    yahoo = await yahooQuote();
  } catch {
    yahoo = null;
  }

  if (configured()) {
    try {
      const live = await angelLtpAndCandles();
      const bars5m = live.bars5m.length ? live.bars5m : yahoo?.bars5m || [];
      return {
        last: live.last,
        bars: bars5m,
        source: live.source,
        angel: true,
      };
    } catch {
      if (yahoo) {
        return {
          last: yahoo.last,
          bars: yahoo.bars5m,
          source: `${yahoo.source} (Angel login failed)`,
          angel: false,
        };
      }
      throw new Error("no feed");
    }
  }

  if (!yahoo) throw new Error("no feed");
  return {
    last: yahoo.last,
    bars: yahoo.bars5m,
    source: `${yahoo.source} (Angel env not set on this process)`,
    angel: false,
  };
}
