import { useEffect, useState, useCallback } from "react";
import { Newspaper, RefreshCw, ExternalLink, Zap } from "lucide-react";
import { supabase, EDGE_FUNCTION_BASE } from "@/lib/supabase";
import type { NewsItem } from "@/lib/types";
import { LoadingState, EmptyState } from "@/components/States";
import { SentimentBadge } from "@/components/Badges";
import { timeAgo } from "@/lib/utils";
import DonutChart from "@/components/DonutChart";

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");
  const [filter, setFilter] = useState<"all" | "bullish" | "bearish" | "neutral">("all");

  const fetchNews = useCallback(async () => {
    const { data } = await supabase.from("news_items").select("*").order("published_at", { ascending: false });
    if (data) setNews(data as NewsItem[]);
    setLoading(false);
  }, []);

  const refreshFeeds = useCallback(async () => {
    setRefreshing(true);
    try {
      const resp = await fetch(`${EDGE_FUNCTION_BASE}/news-desk`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (resp.ok) {
        await fetchNews();
        setLastUpdate(new Date().toLocaleTimeString("en-US"));
      }
    } catch {
      // ignore
    }
    setRefreshing(false);
  }, [fetchNews]);

  useEffect(() => {
    fetchNews();
    refreshFeeds();
    // Auto-refresh every 5 minutes
    const interval = setInterval(refreshFeeds, 300000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingState message="Loading AI news desk..." />;

  const filtered = filter === "all" ? news : news.filter((n) => n.sentiment === filter);
  const bullCount = news.filter((n) => n.sentiment === "bullish").length;
  const bearCount = news.filter((n) => n.sentiment === "bearish").length;
  const neutralCount = news.filter((n) => n.sentiment === "neutral").length;

  const filters: Array<{ id: typeof filter; label: string; count: number; color: string }> = [
    { id: "all", label: "All", count: news.length, color: "text-slate-300" },
    { id: "bullish", label: "Bullish", count: bullCount, color: "text-green-400" },
    { id: "bearish", label: "Bearish", count: bearCount, color: "text-red-400" },
    { id: "neutral", label: "Neutral", count: neutralCount, color: "text-slate-400" },
  ];

  const donutSegments = [
    { label: "Bullish", value: bullCount, color: "#22c55e" },
    { label: "Bearish", value: bearCount, color: "#ef4444" },
    { label: "Neutral", value: neutralCount, color: "#64748b" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">News</h3>
            <p className="text-xs text-slate-500 hidden sm:block">Live crypto RSS feeds with keyword & sentiment analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[10px] text-slate-600 hidden sm:block">Updated: {lastUpdate}</span>
          )}
          <button
            onClick={refreshFeeds}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Analyzing..." : "Refresh Feeds"}
          </button>
        </div>
      </div>

      {/* Sentiment Summary + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <span className="text-lg font-bold text-green-400">{bullCount}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-green-400">Bullish</p>
            <p className="text-[10px] text-slate-600">{news.length > 0 ? Math.round((bullCount / news.length) * 100) : 0}% of articles</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <span className="text-lg font-bold text-red-400">{bearCount}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-400">Bearish</p>
            <p className="text-[10px] text-slate-600">{news.length > 0 ? Math.round((bearCount / news.length) * 100) : 0}% of articles</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-500/10 flex items-center justify-center">
            <span className="text-lg font-bold text-slate-400">{neutralCount}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Neutral</p>
            <p className="text-[10px] text-slate-600">{news.length > 0 ? Math.round((neutralCount / news.length) * 100) : 0}% of articles</p>
          </div>
        </div>
        <div className="glass-card p-5">
          <h4 className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Sentiment Distribution</h4>
          <DonutChart segments={donutSegments} size={120} thickness={14} />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === f.id
                ? "bg-slate-800 text-white border border-slate-700"
                : "text-slate-500 hover:text-slate-300 border border-transparent"
            }`}
          >
            {f.label} <span className={f.color}>({f.count})</span>
          </button>
        ))}
      </div>

      {/* News List */}
      {filtered.length === 0 ? (
        <EmptyState message="No articles found for this filter." />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="glass-card p-4 hover:border-amber-500/20 transition-all duration-300 group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <SentimentBadge sentiment={item.sentiment} />
                    {item.source && (
                      <span className="text-[10px] text-slate-600 uppercase tracking-wider">{item.source}</span>
                    )}
                    <span className="text-[10px] text-slate-600">· {timeAgo(item.published_at)}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">
                    {item.title}
                  </h4>
                  {item.keywords && item.keywords.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {item.keywords.slice(0, 5).map((kw) => (
                        <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-500">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-amber-400 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
