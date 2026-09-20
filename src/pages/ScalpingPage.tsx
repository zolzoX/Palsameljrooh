import { useEffect, useState, useCallback } from "react";
import { Activity, TrendingUp, TrendingDown, Minus, RefreshCw, Zap } from "lucide-react";
import { supabase, EDGE_FUNCTION_BASE } from "@/lib/supabase";
import type { LivePair, Timeframe } from "@/lib/types";
import { TIMEFRAMES } from "@/lib/types";
import { LoadingState, ErrorState } from "@/components/States";
import { TrendBadge } from "@/components/Badges";
import CandlestickChart from "@/components/CandlestickChart";
import AreaChart from "@/components/AreaChart";
import { formatPrice, formatNumber } from "@/lib/utils";

function rsiColor(rsi: number): string {
  if (rsi >= 70) return "text-red-400";
  if (rsi <= 30) return "text-green-400";
  return "text-slate-300";
}

function rsiLabel(rsi: number): string {
  if (rsi >= 70) return "Overbought";
  if (rsi <= 30) return "Oversold";
  return "Neutral";
}

export default function ScalpingPage() {
  const [pairs, setPairs] = useState<LivePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");

  const fetchLive = useCallback(async (tf: Timeframe = timeframe) => {
    setRefreshing(true);
    setError(null);
    try {
      const resp = await fetch(`${EDGE_FUNCTION_BASE}/crypto-live`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timeframe: tf }),
      });
      if (!resp.ok) throw new Error("Failed to fetch live data");
      const data = await resp.json();
      if (data.pairs) {
        setPairs(data.pairs as LivePair[]);
        setLastUpdate(new Date().toLocaleTimeString("en-US"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      const { data } = await supabase.from("scalping_pairs").select("*").order("symbol");
      if (data) {
        setPairs(
          data.map((p) => ({
            symbol: p.symbol,
            name: p.name,
            price: p.price,
            priceChange24h: p.price_change_24h,
            rsi: p.rsi,
            emaFast: p.ema_fast,
            emaSlow: p.ema_slow,
            macdLine: p.macd_line ?? 0,
            macdSignal: p.macd_signal ?? 0,
            macdHistogram: p.macd_histogram ?? 0,
            bbUpper: p.bb_upper ?? 0,
            bbMiddle: p.bb_middle ?? 0,
            bbLower: p.bb_lower ?? 0,
            trend: p.trend,
            volume: p.volume,
            klines: [],
            timeframe: tf,
            timeframes: {},
          })) as LivePair[]
        );
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, [timeframe]);

  useEffect(() => {
    fetchLive(timeframe);
    const interval = setInterval(() => fetchLive(timeframe), 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  if (loading) return <LoadingState message="Connecting to Binance API..." />;

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Scalping Engine</h3>
            <p className="text-xs text-slate-500 hidden sm:block">
              Live Binance — RSI + EMA + MACD + Bollinger Bands
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[10px] text-slate-600 hidden sm:block">Updated: {lastUpdate}</span>
          )}
          <button
            onClick={() => fetchLive(timeframe)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Fetching..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Timeframe Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider mr-1 sm:mr-2 flex-shrink-0">TF</span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            onClick={() => setTimeframe(tf.id)}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${
              timeframe === tf.id
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                : "text-slate-500 hover:text-slate-300 border border-transparent bg-slate-800/30"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/20">
          <ErrorState message={`Live API error: ${error}. Showing cached data.`} />
        </div>
      )}

      {/* Pair Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {pairs.map((pair) => {
          const tfData = pair.timeframes?.[timeframe];
          const rsi = tfData?.rsi ?? pair.rsi;
          const emaFast = tfData?.emaFast ?? pair.emaFast;
          const emaSlow = tfData?.emaSlow ?? pair.emaSlow;
          const macdLine = tfData?.macdLine ?? pair.macdLine ?? 0;
          const macdSignal = tfData?.macdSignal ?? pair.macdSignal ?? 0;
          const macdHist = tfData?.macdHistogram ?? pair.macdHistogram ?? 0;
          const bbUpper = tfData?.bbUpper ?? pair.bbUpper ?? 0;
          const bbLower = tfData?.bbLower ?? pair.bbLower ?? 0;
          const bbMiddle = tfData?.bbMiddle ?? pair.bbMiddle ?? 0;
          const trend = tfData?.trend ?? pair.trend;
          const klines = tfData?.klines ?? pair.klines;

          const TrendIcon = trend === "bullish" ? TrendingUp : trend === "bearish" ? TrendingDown : Minus;
          const isBullishEma = emaFast > emaSlow;
          const macdBullish = macdHist > 0;
          const chartColor = trend === "bullish" ? "#22c55e" : trend === "bearish" ? "#ef4444" : "#94a3b8";
          const candles = klines.map((k) => ({ open: k.open, high: k.high, low: k.low, close: k.close }));
          const closes = klines.map((k) => k.close);
          const price = pair.price;
          const bbPosition = bbUpper > bbLower ? ((price - bbLower) / (bbUpper - bbLower)) * 100 : 50;

          return (
            <div key={pair.symbol} className="glass-card p-5 hover:border-slate-700/80 transition-all duration-300">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-slate-800/60 flex items-center justify-center text-xs font-bold text-white">
                    {pair.symbol}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{pair.name}</p>
                    <p className="text-[10px] text-slate-500">{pair.symbol}/USDT · Binance · {timeframe}</p>
                  </div>
                </div>
                <TrendBadge trend={trend} />
              </div>

              {/* Price */}
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-white tracking-tight">${formatPrice(price)}</p>
                  <p className={`text-xs font-semibold ${pair.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {pair.priceChange24h >= 0 ? "+" : ""}{pair.priceChange24h.toFixed(2)}% (24h)
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-cyan-400">
                  <Zap className="w-3 h-3" />
                  LIVE
                </div>
              </div>

              {/* Candlestick Chart */}
              <div className="mb-4 rounded-lg bg-slate-900/40 p-2">
                {candles.length > 1 ? (
                  <CandlestickChart data={candles} width={280} height={100} color={chartColor} />
                ) : (
                  <AreaChart data={closes.length > 1 ? closes : [price * 0.98, price]} width={280} height={100} color={chartColor} />
                )}
                <p className="text-[9px] text-slate-600 text-center mt-1">{timeframe} candles · last 48 periods</p>
              </div>

              {/* RSI Gauge */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">RSI (14) · {timeframe}</span>
                  <span className={`text-xs font-bold ${rsiColor(rsi)}`}>
                    {rsi.toFixed(1)} — {rsiLabel(rsi)}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="absolute inset-0 flex">
                    <div className="w-[30%] bg-green-500/20" />
                    <div className="flex-1 bg-slate-700/30" />
                    <div className="w-[30%] bg-red-500/20" />
                  </div>
                  <div
                    className="absolute top-0 h-full w-1 bg-cyan-400 rounded-full transition-all duration-500"
                    style={{ left: `${rsi}%`, transform: "translateX(-50%)" }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-slate-600">
                  <span>0</span><span>30</span><span>50</span><span>70</span><span>100</span>
                </div>
              </div>

              {/* MACD */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">MACD · {timeframe}</span>
                  <span className={`text-xs font-bold ${macdBullish ? "text-green-400" : "text-red-400"}`}>
                    {macdBullish ? "Bullish" : "Bearish"} ({macdHist.toFixed(2)})
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>Line: <span className="text-slate-300 font-mono">{macdLine.toFixed(2)}</span></span>
                  <span>Signal: <span className="text-slate-300 font-mono">{macdSignal.toFixed(2)}</span></span>
                </div>
                {/* MACD histogram bar */}
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-800 overflow-hidden relative">
                  <div className="absolute top-0 left-1/2 w-px h-full bg-slate-600" />
                  <div
                    className={`absolute top-0 h-full rounded-full ${macdBullish ? "bg-green-500/60" : "bg-red-500/60"}`}
                    style={{
                      left: macdBullish ? "50%" : `${50 - Math.min(50, Math.abs(macdHist) * 10)}%`,
                      width: `${Math.min(50, Math.abs(macdHist) * 10)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Bollinger Bands */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Bollinger Bands · {timeframe}</span>
                  <span className={`text-xs font-bold ${
                    price <= bbLower ? "text-green-400" : price >= bbUpper ? "text-red-400" : "text-slate-300"
                  }`}>
                    {price <= bbLower ? "Lower band" : price >= bbUpper ? "Upper band" : "Mid-range"}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="absolute inset-0 bg-slate-700/20" />
                  <div
                    className="absolute top-0 h-full w-1 bg-amber-400 rounded-full transition-all duration-500"
                    style={{ left: `${Math.max(0, Math.min(100, bbPosition))}%`, transform: "translateX(-50%)" }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-slate-600">
                  <span>Lower: ${formatPrice(bbLower)}</span>
                  <span>Mid: ${formatPrice(bbMiddle)}</span>
                  <span>Upper: ${formatPrice(bbUpper)}</span>
                </div>
              </div>

              {/* EMA + Volume */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/60">
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">EMA Fast / Slow · {timeframe}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">${formatPrice(emaFast)}</span>
                    <span className="text-slate-600 text-xs">/</span>
                    <span className="text-sm font-bold text-slate-400">${formatPrice(emaSlow)}</span>
                  </div>
                  <div className={`flex items-center gap-1 mt-0.5 text-[10px] ${isBullishEma ? "text-green-400" : "text-red-400"}`}>
                    <TrendIcon className="w-3 h-3" />
                    {isBullishEma ? "Bullish cross" : "Bearish cross"}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Volume (24h)</p>
                  <p className="text-sm font-bold text-white">${formatNumber(pair.volume)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Signal Summary */}
      <div className="glass-card p-5">
        <h4 className="text-sm font-semibold text-slate-300 mb-3">Engine Summary · {timeframe}</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">Pairs</p>
            <p className="text-xl font-bold text-cyan-400">{pairs.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">Bullish</p>
            <p className="text-xl font-bold text-green-400">
              {pairs.filter((p) => (p.timeframes?.[timeframe]?.trend ?? p.trend) === "bullish").length}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">Bearish</p>
            <p className="text-xl font-bold text-red-400">
              {pairs.filter((p) => (p.timeframes?.[timeframe]?.trend ?? p.trend) === "bearish").length}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">Oversold</p>
            <p className="text-xl font-bold text-amber-400">
              {pairs.filter((p) => (p.timeframes?.[timeframe]?.rsi ?? p.rsi) <= 30).length}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">MACD Bullish</p>
            <p className="text-xl font-bold text-blue-400">
              {pairs.filter((p) => (p.timeframes?.[timeframe]?.macdHistogram ?? p.macdHistogram ?? 0) > 0).length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
