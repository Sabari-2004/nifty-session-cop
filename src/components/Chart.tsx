import { useEffect, useRef } from "react";

const SCRIPT = "https://s3.tradingview.com/tv.js";

export default function Chart() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `tv_${Math.random().toString(36).slice(2)}`;
    if (host.current) host.current.id = id;

    const boot = () => {
      if (cancelled || !window.TradingView) return;
      new window.TradingView.widget({
        autosize: true,
        symbol: "NSE:NIFTY",
        interval: "5",
        timezone: "Asia/Kolkata",
        theme: "dark",
        style: "1",
        locale: "en",
        hide_top_toolbar: false,
        hide_legend: false,
        allow_symbol_change: false,
        container_id: id,
        studies: [],
      });
    };

    if (window.TradingView) {
      boot();
    } else {
      const existing = document.querySelector(`script[src="${SCRIPT}"]`);
      if (existing) {
        existing.addEventListener("load", boot);
      } else {
        const s = document.createElement("script");
        s.src = SCRIPT;
        s.async = true;
        s.onload = boot;
        document.body.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={host} className="chart-box" />;
}
