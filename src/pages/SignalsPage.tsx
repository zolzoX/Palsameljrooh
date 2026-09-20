import { useEffect, useState, useCallback } from "react";
import { History, Search, ExternalLink, Filter, Radio, CheckCircle2, Circle, Crown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Signal, SignalStatus } from "@/lib/types";
import { LoadingState, EmptyState } from "@/components/States";
import { StatusBadge, SentimentBadge } from "@/components/Badges";
import { timeAgo } from "@/lib/utils";

const ENGINE_LABELS: Record<string, string> = {
  scalping: "Scalping",
  meme: "Meme Radar",
  whale: "Whale Tracker",
  news: "News",
};

const ENGINE_COLORS: Record<string, string> = {
  scalping: "text-cyan-400 bg-cyan-500/10",
  meme: "text-pink-400 bg-pink-500/10",
  whale: "text-blue-400 bg-blue-500/10",
  news: "text-amber-400 bg-amber-500/10",
};

const INDICATOR_COLORS: Record<string, string> = {
  RSI: "text-purple-400 bg-purple-500/10",
  EMA: "text-cyan-400 bg-cyan-500/10",
  MACD: "text-blue-400 bg-blue-500/10",
  BB: "text-amber-400 bg-amber-500/10",
  STOCH: "text-green-400 bg-green-500/10",
  ADX: "text-orange-400 bg-orange-500/10",
  VWAP: "text-teal-400 bg-teal-500/10",
  WHALE: "text-blue-400 bg-blue-500/10",
  NEWS: "text-amber-400 bg-amber-500/10",
  MEME: "text-pink-400 bg-pink-500/10",
};

function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "—";
  if (p < 0.001) return p.toPrecision(4);
  if (p < 1) return p.toFixed(6);
  if (p < 100) return p.toFixed(4);
  return p.toFixed(2);
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SignalStatus>("all");
  const [engineFilter, setEngineFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<"all" | "free" | "vip">("all");
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const fetchSignals = useCallback(async () => {
    const { data } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setSignals(data as Signal[]);
    setLastRefresh(new Date().toLocaleTimeString("en-US"));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 15000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  let filtered = signals;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.message?.toLowerCase().includes(q) ?? false) ||
        (s.pair?.toLowerCase().includes(q) ?? false)
    );
  }
  if (statusFilter !== "all") filtered = filtered.filter((s) => s.status === statusFilter);
  if (engineFilter !== "all") filtered = filtered.filter((s) => s.engine_slug === engineFilter);
  if (channelFilter !== "all") filtered = filtered.filter((s) => (channelFilter === "vip" ? s.is_vip : !s.is_vip));

  const statusCounts: Record<SignalStatus, number> = {
    sent: signals.filter((s) => s.status === "sent").length,
    pending: signals.filter((s) => s.status === "pending").length,
    failed: signals.filter((s) => s.status === "failed").length,
  };

  const hasTradeLevels = (s: Signal) => s.tp1_price != null || s.tp2_price != null || s.tp3_price != null;

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-500/10 text-slate-300 flex items-center justify-center flex-shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Signals History</h3>
            <p className="text-xs text-slate-500 hidden sm:block">Auto-generated signals with take-profit tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-semibold">
            <Radio className="w-3 h-3 animate-pulse" />
            AUTO
          </span>
          {lastRefresh && <span className="text-[10px] text-slate-600">Updated {lastRefresh}</span>}
        </div>
      </div>

      <div className="glass-card p-3 flex items-center gap-3">
        <Radio className="w-4 h-4 text-green-400 flex-shrink-0 animate-pulse" />
        <p className="text-xs text-slate-400">
          Free channels use 4 indicators (RSI, EMA, MACD, BB) — up to 90 signals/day. VIP channels use 7 indicators (adds Stochastic, ADX, VWAP) — all must agree, max 25 signals/day. Take-profit targets are auto-checked against live prices.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <span className="text-lg font-bold text-green-400">{statusCounts.sent}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-green-400">Sent</p>
            <p className="text-[10px] text-slate-600">{signals.length > 0 ? Math.round((statusCounts.sent / signals.length) * 100) : 0}% delivery rate</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <span className="text-lg font-bold text-amber-400">{statusCounts.pending}</span>
          </div>
          <div><p className="text-xs font-semibold text-amber-400">Pending</p><p className="text-[10px] text-slate-600">Awaiting delivery</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <span className="text-lg font-bold text-red-400">{statusCounts.failed}</span>
          </div>
          <div><p className="text-xs font-semibold text-red-400">Failed</p><p className="text-[10px] text-slate-600">Needs attention</p></div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 flex-1">
          <Search className="w-4 h-4 text-slate-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, message, or pair..." className="bg-transparent text-sm text-white placeholder-slate-600 outline-none flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | SignalStatus)} className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none">
            <option value="all">All Statuses</option><option value="sent">Sent</option><option value="pending">Pending</option><option value="failed">Failed</option>
          </select>
          <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none">
            <option value="all">All Engines</option><option value="scalping">Scalping</option><option value="meme">Meme Radar</option><option value="whale">Whale Tracker</option><option value="news">News</option>
          </select>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as "all" | "free" | "vip")} className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none">
            <option value="all">All Channels</option><option value="free">Free</option><option value="vip">VIP</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading signals..." />
      ) : filtered.length === 0 ? (
        <EmptyState message="No signals yet. The signal engine runs automatically — signals will appear here when indicators align." />
      ) : (
        <div className="space-y-3">
          {filtered.map((signal) => (
            <div key={signal.id} className="glass-card p-4 hover:bg-slate-800/20 transition-colors">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold ${ENGINE_COLORS[signal.engine_slug] ?? "text-slate-400 bg-slate-500/10"}`}>
                    {ENGINE_LABELS[signal.engine_slug] ?? signal.engine_slug}
                  </span>
                  {signal.is_vip && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-cyan-400 bg-cyan-500/10">
                      <Crown className="w-3 h-3" /> VIP
                    </span>
                  )}
                  {signal.timeframe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 font-mono">{signal.timeframe}</span>}
                  <SentimentBadge sentiment={signal.sentiment} />
                  <StatusBadge status={signal.status} />
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">{timeAgo(signal.created_at)}</span>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white mb-1">{signal.title}</p>
                  {signal.message && <p className="text-xs text-slate-500 truncate max-w-xs">{signal.message}</p>}
                  {signal.source_url && (
                    <a href={signal.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 mt-1">
                      <ExternalLink className="w-3 h-3" />View Source
                    </a>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-slate-400 font-mono">{signal.pair ?? "—"}</p>
                </div>
              </div>

              {/* Indicators */}
              {signal.indicators && signal.indicators.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {signal.indicators.map((ind) => (
                    <span key={ind} className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${INDICATOR_COLORS[ind] ?? "text-slate-400 bg-slate-500/10"}`}>{ind}</span>
                  ))}
                </div>
              )}

              {/* Take Profit Hit Tracking */}
              {hasTradeLevels(signal) && (
                <div className="mt-3 pt-3 border-t border-slate-800/40">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-600 uppercase tracking-wider">Entry</span>
                      <span className="text-xs text-cyan-400 font-mono">{fmtPrice(signal.entry_price)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-600 uppercase tracking-wider">SL</span>
                      <span className="text-xs text-red-400 font-mono">{fmtPrice(signal.stop_loss_price)}</span>
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                      <TpTag label="TP1" price={signal.tp1_price} hit={signal.tp1_hit} />
                      <TpTag label="TP2" price={signal.tp2_price} hit={signal.tp2_hit} />
                      <TpTag label="TP3" price={signal.tp3_price} hit={signal.tp3_hit} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-600 text-center">Showing {filtered.length} of {signals.length} signals</p>
    </div>
  );
}

function TpTag({ label, price, hit }: { label: string; price: number | null; hit: boolean | null }) {
  if (price == null) return null;
  const isHit = hit === true;
  return (
    <div className="flex items-center gap-1">
      {isHit ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-slate-600" />
      )}
      <span className={`text-xs font-mono ${isHit ? "text-green-400 line-through" : "text-slate-400"}`}>
        {label}: {fmtPrice(price)}
      </span>
      {isHit && <span className="text-[9px] text-green-400 font-semibold bg-green-500/10 px-1 rounded">HIT</span>}
    </div>
  );
}
