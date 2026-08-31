# Nifty Session Cop

Intraday **risk cop** for Nifty: opening-range window, **1R** day stop, **+2R** lock, flat before **CAS**. Not a signal service.

## Rules the UI enforces

- Nifty only (TradingView `NSE:NIFTY`, 5-minute)
- **09:15–09:30** mark opening range — no orders
- **09:30–11:30** only window: 5-minute **close** beyond OR, stop = other side of the range
- After **11:30** no new risk
- **15:15–15:40 CAS** banner: do not hunt stocks or open Nifty risk
- One attempt, −1R / +2R day lock
- Skip tiny OR (&lt; 25 pts) or 1R in ₹ above your cap
- Journal in **R**, not screenshots

## Local

```bash
npm install
npm run dev
```

## GitHub → Render (static, free)

1. Push this repo to GitHub.
2. [Render](https://render.com) → **New → Static Site** → connect the repo.
3. Build: `npm ci && npm run build`
4. Publish directory: `dist`
5. [UptimeRobot](https://uptimerobot.com) HTTP monitor every 5 minutes: `https://YOUR-SITE.onrender.com/health.txt`

`render.yaml` is included if you use Render Blueprint.

## Disclaimer

Educational process tool. Markets can lose money. Options and auctions can exceed a planned 1R if you override the locks.
