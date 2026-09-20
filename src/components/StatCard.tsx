import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: number;
  color?: "cyan" | "green" | "amber" | "red" | "blue" | "pink";
  subtitle?: string;
}

const colorMap: Record<string, { bg: string; text: string; glow: string }> = {
  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-400", glow: "glow-cyan" },
  green: { bg: "bg-green-500/10", text: "text-green-400", glow: "glow-green" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-400", glow: "glow-amber" },
  red: { bg: "bg-red-500/10", text: "text-red-400", glow: "glow-red" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-400", glow: "" },
  pink: { bg: "bg-pink-500/10", text: "text-pink-400", glow: "" },
};

export default function StatCard({ label, value, icon, trend, color = "cyan", subtitle }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className="glass-card p-5 hover:border-slate-700/80 transition-all duration-300 group">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center`}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
      {subtitle && <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>}
    </div>
  );
}
