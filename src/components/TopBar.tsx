import { useEffect, useState } from "react";
import { Bell, Search, RefreshCw, Menu } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onMenuClick?: () => void;
}

export default function TopBar({ title, subtitle, onRefresh, refreshing, onMenuClick }: TopBarProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-slate-800/60 bg-[#0a0e17]/60 backdrop-blur-xl flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:text-white transition-colors flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 truncate hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none w-24 lg:w-32"
          />
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        )}

        <button className="relative p-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:text-slate-200 transition-all">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400" />
        </button>

        <div className="text-right hidden sm:block">
          <p className="text-xs font-mono text-slate-400">
            {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-[10px] text-slate-600">
            {now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>
    </header>
  );
}
