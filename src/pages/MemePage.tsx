import { useEffect, useState, useCallback } from "react";
import { Rocket, RefreshCw, ExternalLink, Droplet, Zap, TrendingUp, TrendingDown, AlertTriangle, Shield, Flame, Activity, BarChart3, Lock, Crown } from "lucide-react";
import { supabase, EDGE_FUNCTION_BASE } from "@/lib/supabase";
import type { MemeToken } from "@/lib/types";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { formatPrice, formatNumber, timeAgo } from "@/lib/utils";
import DonutChart from "@/components/DonutChart";

interface MemeTokenExtended extends MemeToken {
  source?: string;
  momentum?: string;
  caution?: string;
  risk_level?: string;
  riskLevel?: string;
  priceChange6h?: number;
  priceChange1h?: number;
  priceChange5m?: number;
  txnsBuys24h?: number;
  txnsSells24h?: number;
  txnsBuys1h?: number;
  txnsSells1h?: number;
  buySellRatio?: number;
  fdv?: number;
  volume6h?: number;
  volume1h?: number;
  token_address?: string;
  pair_address?: string;
  dex_id?: string;
}

const MOMENTUM_STYLES: Record<string, { color: string; icon: typeof TrendingUp; label: string }> = {
  "strong-bullish": { color: "text-green-400 bg-green-500/10 border-green-500/20", icon: TrendingUp, label: "STRONG BULL" },
  "bullish": { color: "text-green-400 bg-green-500/10 border-green-500/20", icon: TrendingUp, label: "BULLISH" },
  "surging": { color: "text-green-400 bg-green-500/10 border-green-500/20", icon: Flame, label: "SURGING" },
  "strong-bearish": { color: "text-red-400 bg-red-500/10 border-red-500/20", icon: TrendingDown, label: "STRONG BEAR" },
  "bearish": { color: "text-red-400 bg-red-500/10 border-red-500/20", icon: TrendingDown, label: "BEARISH" },
  "dumping": { color: "text-red-400 bg-red-500/10 border-red-500/20", icon: TrendingDown, label: "DUMPING" },
  "neutral": { color: "text-slate-400 bg-slate-500/10 border-slate-600/20", icon: Activity, label: "NEUTRAL" },
};

const RISK_STYLES: Record<string, { color: string; label: string }> = {
  "low": { color: "text-green-400", label: "Low Risk" },
  "medium": { color: "text-amber-400", label: "Medium Risk" },
  "high": { color: "text-orange-400", label: "High Risk" },
  "extreme": { color: "text-red-400", label: "Extreme Risk" },
};

const SOURCE_STYLES: Record<string, { color: string; label: string }> = {
  "DexScreener": { color: "text-pink-400 bg-pink-500/10", label: "DexScreener" },
  "Robinhood": { color: "text-green-400 bg-green-500/10", label: "Robinhood" },
};

function getCoinLogoUrl(token: MemeTokenExtended): string {
  // DexScreener stores token images at a predictable URL pattern
  if (token.token_address && token.chain) {
    return `https://api.dexscreener.com/tokens/${token.chain}/${token.token_address}`;
  }
  // Fallback: CoinGecko logo API by symbol
  return `https://assets.coincap.io/assets/icons/${token.symbol.toLowerCase().replace("-rh", "")}@2x.png`;
}

function PriceChange({ value, label }: { value: number; label: string }) {
  const positive = value >= 0;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] text-slate-600 uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-bold ${positive ? "text-green-400" : "text-red-400"}`}>
        {positive ? "+" : ""}{value.toFixed(2)}%
      </span>
    </div>
  );
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/40 last:border-0">
      <span className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-semibold ${valueColor ?? "text-white"}`}>{value}</span>
    </div>
  );
}

export default function MemePage() {
  const [tokens, setTokens] = useState<MemeTokenExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState("");

  const fetchTokens = useCallback(async () => {
    const { data } = await supabase.from("meme_tokens").select("*").order("volume_24h", { ascending: false });
    if (data) setTokens(data as MemeTokenExtended[]);
    setLoading(false);
  }, []);

  const refreshFromDex = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const resp = await fetch(`${EDGE_FUNCTION_BASE}/meme-radar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (!resp.ok) throw new Error("Failed to refresh meme radar");
      const data = await resp.json();
      if (data.tokens) setTokens(data.tokens as MemeTokenExtended[]);
      setLastUpdate(new Date().toLocaleTimeString("en-US"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      await fetchTokens();
    }
    setRefreshing(false);
  }, [fetchTokens]);

  useEffect(() => {
    fetchTokens();
    refreshFromDex();
    const interval = setInterval(refreshFromDex, 120000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingState message="Loading meme radar..." />;

  const chainMap: Record<string, number> = {};
  tokens.forEach((t) => { chainMap[t.chain] = (chainMap[t.chain] ?? 0) + 1; });
  const chainColors: Record<string, string> = {
    ethereum: "#627eea", solana: "#9945ff", base: "#0052ff", bsc: "#f3ba2f",
    robinhood: "#22c55e",
  };
  const donutSegments = Object.entries(chainMap).map(([label, value]) => ({
    label, value, color: chainColors[label] ?? "#64748b",
  }));

  const bullishCount = tokens.filter((t) => (t.momentum ?? "neutral").includes("bullish") || (t.momentum ?? "neutral") === "surging").length;
  const bearishCount = tokens.filter((t) => (t.momentum ?? "neutral").includes("bearish") || (t.momentum ?? "neutral") === "dumping").length;
  const highRiskCount = tokens.filter((t) => (t.risk_level ?? t.riskLevel) === "high" || (t.risk_level ?? t.riskLevel) === "extreme").length;

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center flex-shrink-0">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Meme Radar</h3>
            <p className="text-xs text-slate-500 hidden sm:block">DexScreener + Robinhood — advanced momentum analysis with 5m/1h/6h/24h indicators</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && <span className="text-[10px] text-slate-600 hidden sm:block">Updated: {lastUpdate}</span>}
          <button onClick={refreshFromDex} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20 hover:bg-pink-500/20 transition-all text-sm font-medium disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Scanning..." : "Refresh Radar"}
          </button>
        </div>
      </div>

      {error && <div className="glass-card p-4 border-red-500/20"><ErrorState message={error} /></div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
            <span className="text-lg font-bold text-pink-400">{tokens.length}</span>
          </div>
          <div><p className="text-xs font-semibold text-pink-400">Tokens</p><p className="text-[10px] text-slate-600">DexScreener + Robinhood</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div><p className="text-xs font-semibold text-green-400">Bullish</p><p className="text-[10px] text-slate-600">{bullishCount} tokens trending up</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-red-400" />
          </div>
          <div><p className="text-xs font-semibold text-red-400">Bearish</p><p className="text-[10px] text-slate-600">{bearishCount} tokens trending down</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          </div>
          <div><p className="text-xs font-semibold text-orange-400">High Risk</p><p className="text-[10px] text-slate-600">{highRiskCount} need caution</p></div>
        </div>
      </div>

      {/* Liquidity info + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-4 lg:col-span-2">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
            <Droplet className="w-3.5 h-3.5 text-pink-400" />
            Showing tokens with liquidity <span className="text-pink-400 font-semibold">&gt; $50K</span>
            {tokens.length > 0 && <span className="text-slate-600">· Last scan: {timeAgo(tokens[0].fetched_at)}</span>}
            <span className="flex items-center gap-1 ml-auto text-cyan-400"><Zap className="w-3 h-3" />LIVE</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Tokens Found</p>
              <p className="text-xl font-bold text-white">{tokens.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total Liquidity</p>
              <p className="text-xl font-bold text-pink-400">${formatNumber(tokens.reduce((s, t) => s + t.liquidity, 0))}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total Volume 24h</p>
              <p className="text-xl font-bold text-white">${formatNumber(tokens.reduce((s, t) => s + t.volume_24h, 0))}</p>
            </div>
          </div>
        </div>
        {donutSegments.length > 0 && (
          <div className="glass-card p-5">
            <h4 className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">By Source / Chain</h4>
            <DonutChart segments={donutSegments} size={120} thickness={14} />
          </div>
        )}
      </div>

      {/* Token Cards */}
      {tokens.length === 0 ? (
        <EmptyState message="No trending tokens found. Click Refresh Radar to scan DexScreener and Robinhood." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tokens.map((token, idx) => {
            const isLocked = (idx % 4) === 3;
            const momentum = token.momentum ?? "neutral";
            const momStyle = MOMENTUM_STYLES[momentum] ?? MOMENTUM_STYLES["neutral"];
            const MomIcon = momStyle.icon;
            const risk = token.risk_level ?? token.riskLevel ?? "medium";
            const riskStyle = RISK_STYLES[risk] ?? RISK_STYLES["medium"];
            const source = token.source ?? "DexScreener";
            const srcStyle = SOURCE_STYLES[source] ?? SOURCE_STYLES["DexScreener"];
            const isRobinhood = source === "Robinhood";
            const logoUrl = getCoinLogoUrl(token);

            const change5m = token.price_change_5m ?? token.priceChange5m ?? 0;
            const change1h = token.price_change_1h ?? token.priceChange1h ?? 0;
            const change6h = token.price_change_6h ?? token.priceChange6h ?? 0;
            const change24h = token.price_change_24h ?? 0;
            const buys24 = token.txns_buys_24h ?? token.txnsBuys24h ?? 0;
            const sells24 = token.txns_sells_24h ?? token.txnsSells24h ?? 0;
            const buys1h = token.txns_buys_1h ?? token.txnsBuys1h ?? 0;
            const sells1h = token.txns_sells_1h ?? token.txnsSells1h ?? 0;
            const buySell = token.buy_sell_ratio ?? token.buySellRatio ?? 0;
            const fdv = token.fdv ?? 0;
            const vol6h = token.volume_6h ?? token.volume6h ?? 0;
            const vol1h = token.volume_1h ?? token.volume1h ?? 0;

            return (
              <div key={token.id ?? token.symbol} className={`glass-card p-5 hover:border-pink-500/20 transition-all duration-300 group ${risk === "extreme" ? "border-red-500/20" : ""} relative ${isLocked ? "overflow-hidden" : ""}`}>
                {/* Locked overlay for every 4th meme signal */}
                {isLocked && (
                  <div className="absolute inset-0 z-10 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <Lock className="w-7 h-7 text-amber-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-amber-400 mb-1">VIP Signal Locked</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed max-w-[180px]">
                        This meme signal is locked. Upgrade to VIP to unlock advanced meme radar signals.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold">
                      <Crown className="w-3 h-3" />
                      Upgrade to VIP
                    </div>
                  </div>
                )}
                {/* Header with logo */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-800/60 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-700/30">
                      <img
                        src={logoUrl}
                        alt={token.symbol}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class=\"text-xs font-bold text-pink-300\">${token.symbol.slice(0, 3)}</span>`;
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{token.symbol}</p>
                      <p className="text-[10px] text-slate-500 truncate max-w-[120px]">{token.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${srcStyle.color}`}>
                      {srcStyle.label}
                    </span>
                    <span className="text-[10px] text-slate-600 uppercase">{token.chain}</span>
                  </div>
                </div>

                {/* Price + Multi-timeframe changes */}
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-lg font-bold text-white">${formatPrice(token.price)}</p>
                    <p className={`text-xs font-semibold ${change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}% (24h)
                    </p>
                  </div>
                  {!isRobinhood && (
                    <div className="flex items-center gap-3">
                      <PriceChange value={change5m} label="5m" />
                      <PriceChange value={change1h} label="1h" />
                      <PriceChange value={change6h} label="6h" />
                    </div>
                  )}
                  {token.dex_url && (
                    <a href={token.dex_url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-slate-800/60 text-slate-400 hover:text-pink-400">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {/* Momentum Badge */}
                <div className="mb-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${momStyle.color}`}>
                    <MomIcon className="w-3 h-3" />
                    {momStyle.label}
                  </span>
                </div>

                {/* Caution Banner */}
                {token.caution && token.caution !== "Stable conditions" && (
                  <div className="mb-3 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-400/80 leading-tight">{token.caution}</p>
                  </div>
                )}

                {/* Risk Level */}
                <div className="flex items-center gap-1.5 mb-3">
                  <Shield className={`w-3 h-3 ${riskStyle.color}`} />
                  <span className={`text-[10px] font-semibold ${riskStyle.color}`}>{riskStyle.label}</span>
                </div>

                {/* Data Table — Key Metrics */}
                <div className="space-y-0 pt-3 border-t border-slate-800/60">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BarChart3 className="w-3 h-3 text-pink-400" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Key Metrics</span>
                  </div>
                  <StatRow label="Liquidity" value={isRobinhood ? "N/A" : `$${formatNumber(token.liquidity)}`} valueColor="text-pink-400" />
                  <StatRow label="Volume 24h" value={`$${formatNumber(token.volume_24h)}`} />
                  <StatRow label="Volume 6h" value={`$${formatNumber(vol6h)}`} />
                  <StatRow label="Volume 1h" value={`$${formatNumber(vol1h)}`} />
                  {fdv > 0 && <StatRow label="FDV" value={`$${formatNumber(fdv)}`} valueColor="text-cyan-400" />}
                </div>

                {/* Buy/Sell Analysis */}
                {!isRobinhood && (buys24 + sells24) > 0 && (
                  <div className="space-y-0 pt-3 mt-2 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Activity className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Buy / Sell Ratio</span>
                    </div>
                    {/* Buy/Sell Bar */}
                    <div className="flex h-2 rounded-full overflow-hidden bg-slate-800 mb-2">
                      <div className="bg-green-500/60" style={{ width: `${(buySell * 100).toFixed(0)}%` }} />
                      <div className="bg-red-500/60" style={{ width: `${((1 - buySell) * 100).toFixed(0)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-green-400 font-semibold">Buys: {buys24.toLocaleString()}</span>
                      <span className="text-red-400 font-semibold">Sells: {sells24.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                      <span>1h buys: {buys1h}</span>
                      <span>1h sells: {sells1h}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
