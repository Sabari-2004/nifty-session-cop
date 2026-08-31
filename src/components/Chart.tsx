export default function Chart() {
  const params = new URLSearchParams({
    symbol: "NSE:NIFTY",
    interval: "5",
    timezone: "Asia/Kolkata",
    theme: "dark",
    style: "1",
    locale: "en",
    toolbarbg: "07090c",
    hideideas: "1",
    hide_legend: "0",
    hide_top_toolbar: "0",
    hidesidetoolbar: "0",
    allow_symbol_change: "0",
    symboledit: "0",
    saveimage: "0",
    withdateranges: "1",
    studies: "[]",
  });

  return (
    <iframe
      className="chart-box"
      title="Nifty 50 · 5 minute"
      src={`https://www.tradingview.com/widgetembed/?${params.toString()}`}
      referrerPolicy="origin-when-cross-origin"
    />
  );
}
