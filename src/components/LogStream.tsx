import { useEffect, useRef } from "react";
import type { SystemLog, LogLevel } from "@/lib/types";
import { timeClock } from "@/lib/utils";
import { Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

const levelConfig: Record<LogLevel, { icon: typeof Info; color: string; bg: string }> = {
  info: { icon: Info, color: "text-slate-400", bg: "bg-slate-500/10" },
  success: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
  error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
};

interface LogStreamProps {
  logs: SystemLog[];
  max?: number;
}

export default function LogStream({ logs, max = 50 }: LogStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto space-y-1 font-mono text-xs pr-2"
    >
      {logs.slice(0, max).map((log) => {
        const cfg = levelConfig[log.level] ?? levelConfig.info;
        const Icon = cfg.icon;
        return (
          <div
            key={log.id}
            className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-800/30 transition-colors animate-slide-in"
          >
            <span className="text-slate-600 flex-shrink-0">{timeClock(log.created_at)}</span>
            <div className={`flex-shrink-0 w-4 h-4 rounded ${cfg.bg} ${cfg.color} flex items-center justify-center`}>
              <Icon className="w-3 h-3" />
            </div>
            {log.engine_slug && (
              <span className="text-slate-500 flex-shrink-0">[{log.engine_slug}]</span>
            )}
            <span className="text-slate-300">{log.message}</span>
          </div>
        );
      })}
      {logs.length === 0 && (
        <div className="flex items-center justify-center h-full text-slate-600 text-xs">
          No logs yet
        </div>
      )}
    </div>
  );
}
