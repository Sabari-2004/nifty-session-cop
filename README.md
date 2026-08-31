# Nifty Session Cop

Intraday **risk cop** for Nifty: opening-range window, **1R** day stop, **+2R** lock, flat before **CAS**.

Live LTP comes from **Angel One SmartAPI** on the server (env vars). Candles from Angel historical, Yahoo fallback. Chart is **not** TradingView (NSE:NIFTY is blocked on their free embed).

## Rules

- Nifty only, 5-minute
- **09:15–09:30** mark opening range — no orders
- **09:30–11:30** window: 5-minute close beyond OR
- Paper auto journals only — **not a broker**
- After **11:30** no new risk
- **15:15–15:40 CAS** — no new risk
- One attempt, −1R / +2R day lock

## Local

```bash
npm install
npm run dev:server
npm run dev
```

Open Vite URL. API is proxied to port 8787.

## GitHub → Render (**Web Service**, not Static)

Static Site **cannot** use `ANGEL_*` at runtime. Create / switch to **Web Service**:

1. Connect `Sabari-2004/nifty-session-cop` (sync the fork first).
2. Build: `npm ci && npm run build`
3. Start: `npm start`
4. Health: `/health.txt`
5. Environment secrets: `ANGEL_API_KEY`, `ANGEL_CLIENT_ID`, `ANGEL_PASSWORD`, `ANGEL_TOTP_SECRET`

Check (no secrets): `https://YOUR-SITE.onrender.com/api/health`  
Should show `"angelConfigured": true` if env is on **this** service.

UptimeRobot: `https://YOUR-SITE.onrender.com/health.txt`

## Disclaimer

Educational process tool. Markets can lose money. Paper fills are not exchange orders.
