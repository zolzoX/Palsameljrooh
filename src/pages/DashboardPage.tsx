import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Rocket,
  Waves,
  Newspaper,
  Send,
  Server,
  Zap,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { supabase, EDGE_FUNCTION_BASE } from "@/lib/supabase";
import type { BotEngine, SystemLog, LivePair } from "@/lib/types";
import StatCard from "@/components/StatCard";
import LogStream from "@/components/LogStream";
import AreaChart from "@/components/AreaChart";
import { LoadingState } from "@/components/States";
import { timeAgo, formatPrice } from "@/lib/utils";

const engineIcons: Record<string, typeof Activity> = {
  scalping: Activity,
  meme: Rocket,
  whale: Waves,
  news: Newspaper,
};

const engineColors: Record<string, "cyan" | "pink" | "blue" | "amber"> = {
  scalping: "cyan",
  meme: "pink",
  whale: "blue",
  news: "amber",
};

export default function DashboardPage({ engineRunning, lastEngineRun }: { engineRunning?: boolean; lastEngineRun?: string | null }) {
  const [engines, setEngines] = useState<BotEngine[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [totalSignals, setTotalSignals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [livePairs, setLivePairs] = useState<LivePair[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: engData }, { data: logData }, { count }] = await Promise.all([
      supabase.from("bot_engines").select("*").order("slug"),
      supabase.from("system_logs").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("signals").select("*", { count: "exact", head: true }),
    ]);
    if (engData) setEngines(engData);
    if (logData) setLogs(logData as SystemLog[]);
    if (count !== null) setTotalSignals(count);
    setLoading(false);
  }, []);

  const fetchLive = useCallback(async () => {
    setRefreshing(true);
    try {
      const resp = await fetch(`${EDGE_FUNCTION_BASE}/crypto-live`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.pairs) setLivePairs(data.pairs as LivePair[]);
      }
    } catch {
      // ignore
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
    fetchLive();
    const interval = setInterval(() => {
      fetchData();
      fetchLive();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, fetchLive]);

  if (loading) return <LoadingState message="Loading dashboard..." />;

  const activeBots = engines.filter((e) => e.is_active).length;
  const signalsToday = engines.reduce((sum, e) => sum + e.signals_today, 0);
  const healthyEngines = engines.filter((e) => e.health === "healthy").length;
  const systemHealth = engines.length > 0 ? Math.round((healthyEngines / engines.length) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      {/* Top bar with refresh + engine status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="glass-card p-3 flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${engineRunning ? "bg-amber-400" : "bg-green-400"}`}>
              {engineRunning && <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />}
            </span>
          </span>
          <div>
            <p className="text-xs font-semibold text-white">Signal Engine</p>
            <p className="text-[10px] text-slate-500">
              {engineRunning ? "Scanning market..." : `Auto-running · Last: ${lastEngineRun ?? "starting"}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => { fetchData(); fetchLive(); }}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:text-cyan-400 text-xs font-medium transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Syncing..." : "Sync Live Data"}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Bots"
          value={activeBots}
          icon={<Zap className="w-5 h-5" />}
          color="cyan"
          subtitle={`${engines.length} total engines`}
        />
        <StatCard
          label="Signals Today"
          value={signalsToday}
          icon={<Send className="w-5 h-5" />}
          color="green"
          subtitle={`${totalSignals} all-time`}
        />
        <StatCard
          label="System Health"
          value={`${systemHealth}%`}
          icon={<Server className="w-5 h-5" />}
          color={systemHealth >= 75 ? "green" : systemHealth >= 50 ? "amber" : "red"}
          subtitle={`${healthyEngines}/${engines.length} engines healthy`}
        />
        <StatCard
          label="Total Signals"
          value={totalSignals}
          icon={<Activity className="w-5 h-5" />}
          color="blue"
          subtitle="Across all engines"
        />
      </div>

      {/* Live Price Tickers */}
      {livePairs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
            Live Market Scan <span className="text-cyan-400 text-[10px]">· {livePairs.length} pairs · Binance API · &gt;$10M volume</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {livePairs.slice(0, 6).map((pair) => {
              const closes = pair.klines.map((k) => k.close);
              const chartColor = pair.trend === "bullish" ? "#22c55e" : pair.trend === "bearish" ? "#ef4444" : "#94a3b8";
              return (
                <div key={pair.symbol} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{pair.symbol}</span>
                      <span className="text-[10px] text-slate-600">{pair.symbol}/USDT</span>
                    </div>
                    <span className={`text-xs font-semibold ${pair.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pair.priceChange24h >= 0 ? "+" : ""}{pair.priceChange24h.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="text-xl font-bold text-white">${formatPrice(pair.price)}</p>
                    {closes.length > 1 && (
                      <AreaChart data={closes.slice(-24)} width={120} height={40} color={chartColor} />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-800/60 text-[10px] text-slate-600">
                    <span>RSI: <span className="text-slate-400 font-medium">{pair.rsi.toFixed(1)}</span></span>
                    <span>Trend: <span className={pair.trend === "bullish" ? "text-green-400" : pair.trend === "bearish" ? "text-red-400" : "text-slate-400"}>{pair.trend}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Engine Cards */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Monitoring Engines</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {engines.map((engine) => {
            const Icon = engineIcons[engine.slug] ?? Activity;
            const color = engineColors[engine.slug] ?? "cyan";
            const colorClass: Record<string, string> = {
              cyan: "text-cyan-400 bg-cyan-500/10",
              pink: "text-pink-400 bg-pink-500/10",
              blue: "text-blue-400 bg-blue-500/10",
              amber: "text-amber-400 bg-amber-500/10",
            };
            return (
              <div key={engine.id} className="glass-card p-5 hover:border-slate-700/80 transition-all duration-300">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${colorClass[color]} flex items-center justify-center`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{engine.name}</h4>
                      <p className="text-xs text-slate-500">{engine.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="pulse-dot">
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${engine.is_active ? "bg-green-400" : "bg-slate-600"}`} />
                      </span>
                      <span className={`text-[10px] font-semibold ${engine.is_active ? "text-green-400" : "text-slate-600"}`}>
                        {engine.is_active ? "ACTIVE" : "IDLE"}
                      </span>
                    </div>
                    {engine.health !== "healthy" && (
                      <div className="flex items-center gap-1 text-[10px] text-amber-400">
                        <AlertCircle className="w-3 h-3" />
                        {engine.health}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-slate-800/60">
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wider">Signals</p>
                    <p className="text-lg font-bold text-white">{engine.signals_today}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wider">Health</p>
                    <p className={`text-lg font-bold ${engine.health === "healthy" ? "text-green-400" : "text-amber-400"}`}>
                      {engine.health === "healthy" ? "Good" : "Warn"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wider">Last Signal</p>
                    <p className="text-sm font-medium text-slate-300">
                      {engine.last_signal_at ? timeAgo(engine.last_signal_at) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-time Logs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Real-Time System Logs</h3>
          <div className="flex items-center gap-2">
            <span className="pulse-dot">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="text-[10px] text-cyan-400 font-semibold">LIVE</span>
          </div>
        </div>
        <div className="glass-card p-4 h-64">
          <LogStream logs={logs} />
        </div>
      </div>
    </div>
  );
}
