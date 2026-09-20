import type { Sentiment, SignalStatus } from "@/lib/types";

export function SentimentBadge({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) return null;
  const config: Record<Sentiment, { bg: string; text: string; label: string }> = {
    bullish: { bg: "bg-green-500/10", text: "text-green-400", label: "Bullish" },
    bearish: { bg: "bg-red-500/10", text: "text-red-400", label: "Bearish" },
    neutral: { bg: "bg-slate-500/10", text: "text-slate-400", label: "Neutral" },
  };
  const c = config[sentiment];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: SignalStatus }) {
  const config: Record<SignalStatus, { bg: string; text: string; dot: string }> = {
    sent: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-400" },
    pending: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
    failed: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function TrendBadge({ trend }: { trend: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    bullish: { bg: "bg-green-500/10", text: "text-green-400" },
    bearish: { bg: "bg-red-500/10", text: "text-red-400" },
    neutral: { bg: "bg-slate-500/10", text: "text-slate-400" },
  };
  const c = config[trend] ?? config.neutral;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${c.bg} ${c.text}`}>
      {trend.charAt(0).toUpperCase() + trend.slice(1)}
    </span>
  );
}
