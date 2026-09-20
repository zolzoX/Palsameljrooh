import { useEffect, useState, useCallback } from "react";
import { Waves, ArrowDownLeft, ArrowUpRight, RefreshCw, Zap } from "lucide-react";
import { supabase, EDGE_FUNCTION_BASE } from "@/lib/supabase";
import type { LiveWhaleAlert } from "@/lib/types";
import { LoadingState, EmptyState } from "@/components/States";
import { formatUsd, formatNumber, timeAgo } from "@/lib/utils";
import DonutChart from "@/components/DonutChart";

const assetColors: Record<string, string> = {
  BTC: "bg-orange-500/10 text-orange-400",
  ETH: "bg-blue-500/10 text-blue-400",
  SOL: "bg-purple-500/10 text-purple-400",
  USDT: "bg-green-500/10 text-green-400",
};

const donutColors: Record<string, string> = {
  BTC: "#f97316",
  ETH: "#3b82f6",
  SOL: "#a855f7",
  USDT: "#22c55e",
};

export default function WhalePage() {
  const [alerts, setAlerts] = useState<LiveWhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");

  const fetchAlerts = useCallback(async () => {
    const { data } = await supabase
      .from("whale_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setAlerts(data as LiveWhaleAlert[]);
    setLoading(false);
  }, []);

  const scanBinance = useCallback(async () => {
    setRefreshing(true);
    try {
      const resp = await fetch(`${EDGE_FUNCTION_BASE}/whale-tracker`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.alerts) setAlerts(data.alerts as LiveWhaleAlert[]);
        setLastUpdate(new Date().toLocaleTimeString("en-US"));
      }
    } catch {
      // fallback to DB
    }
    await fetchAlerts();
    setRefreshing(false);
  }, [fetchAlerts]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(scanBinance, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts, scanBinance]);

  if (loading) return <LoadingState message="Loading whale tracker..." />;

  const totalUsd = alerts.reduce((sum, a) => sum + a.usd_value, 0);
  const inflows = alerts.filter((a) => a.direction === "in");
  const outflows = alerts.filter((a) => a.direction === "out");

  // Donut data by asset
  const assetMap: Record<string, number> = {};
  alerts.forEach((a) => {
    assetMap[a.asset] = (assetMap[a.asset] ?? 0) + 1;
  });
  const donutSegments = Object.entries(assetMap).map(([label, value]) => ({
    label,
    value,
    color: donutColors[label] ?? "#64748b",
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
            <Waves className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Whale Tracker</h3>
            <p className="text-xs text-slate-500 hidden sm:block">Live large trades from Binance — filtered by USD value</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[10px] text-slate-600 hidden sm:block">Updated: {lastUpdate}</span>
          )}
          <button
            onClick={scanBinance}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Scanning..." : "Scan Binance"}
          </button>
        </div>
      </div>

      {/* Summary + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total Alerts</p>
          <p className="text-xl font-bold text-white">{alerts.length}</p>
          <div className="flex items-center gap-1 mt-1 text-[10px] text-cyan-400">
            <Zap className="w-3 h-3" />
            LIVE
          </div>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total USD Moved</p>
          <p className="text-xl font-bold text-blue-400">{formatUsd(totalUsd)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Inflows</p>
          <p className="text-xl font-bold text-green-400">{inflows.length}</p>
          <p className="text-[10px] text-slate-600">{formatUsd(inflows.reduce((s, a) => s + a.usd_value, 0))}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Outflows</p>
          <p className="text-xl font-bold text-red-400">{outflows.length}</p>
          <p className="text-[10px] text-slate-600">{formatUsd(outflows.reduce((s, a) => s + a.usd_value, 0))}</p>
        </div>
      </div>

      {/* Donut + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {donutSegments.length > 0 && (
          <div className="glass-card p-5">
            <h4 className="text-sm font-semibold text-slate-300 mb-4">Alerts by Asset</h4>
            <DonutChart segments={donutSegments} size={140} thickness={16} />
          </div>
        )}

        {alerts.length === 0 ? (
          <EmptyState message="No whale alerts detected yet. Click Scan Binance to check for large trades." />
        ) : (
          <div className="glass-card overflow-hidden lg:col-span-2">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-[#111827]">
                  <tr className="border-b border-slate-800/60">
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Direction</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Asset</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">USD Value</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Tx ID</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => {
                    const isInflow = alert.direction === "in";
                    const colorClass = assetColors[alert.asset] ?? "bg-slate-500/10 text-slate-400";
                    return (
                      <tr key={alert.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors animate-slide-in">
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold ${isInflow ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                            {isInflow ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {isInflow ? "BUY" : "SELL"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold ${colorClass}`}>
                            {alert.asset}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-white">
                          {formatNumber(alert.amount, 4)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-white">
                          {formatUsd(alert.usd_value)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-mono truncate max-w-[120px]">
                          {alert.from_addr ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {timeAgo(alert.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
