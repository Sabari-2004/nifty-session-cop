import { useEffect, useRef } from "react";
import { createChart, ColorType, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from "lightweight-charts";
import type { Bar } from "../lib/quotes";

type Props = {
  bars: Bar[];
  orHigh: number | null;
  orLow: number | null;
};

export default function Chart({ bars, orHigh, orLow }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1016" },
        textColor: "#8b98a8",
      },
      grid: {
        vertLines: { color: "#1a2330" },
        horzLines: { color: "#1a2330" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#243041" },
    });
    const candle = chart.addCandlestickSeries({
      upColor: "#3ddc97",
      downColor: "#ff5d6c",
      borderVisible: false,
      wickUpColor: "#3ddc97",
      wickDownColor: "#ff5d6c",
    });
    api.current = chart;
    series.current = candle;
    const ro = new ResizeObserver(() => {
      if (!host.current) return;
      chart.applyOptions({ width: host.current.clientWidth, height: 480 });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      api.current = null;
      series.current = null;
    };
  }, []);

  useEffect(() => {
    if (!series.current) return;
    const data: CandlestickData<Time>[] = bars.map((b) => ({
      time: b.t as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    series.current.setData(data);
    series.current.applyOptions({
      priceLineVisible: true,
    });
    const lines = [];
    if (orHigh != null) {
      lines.push(
        series.current.createPriceLine({
          price: orHigh,
          color: "#3ddc97",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "ORH",
        }),
      );
    }
    if (orLow != null) {
      lines.push(
        series.current.createPriceLine({
          price: orLow,
          color: "#ff5d6c",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "ORL",
        }),
      );
    }
    return () => {
      for (const line of lines) {
        try {
          series.current?.removePriceLine(line);
        } catch {
          /* chart gone */
        }
      }
    };
  }, [bars, orHigh, orLow]);

  return <div ref={host} className="chart-box" />;
}
