import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Activity,
  Rocket,
  Waves,
  Newspaper,
  Send,
  History,
  ShieldCheck,
  X,
  Gift,
  Users,
} from "lucide-react";

export type PageId =
  | "dashboard"
  | "scalping"
  | "meme"
  | "whale"
  | "news"
  | "telegram"
  | "signals"
  | "referral"
  | "channel-manager";

interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { id: "scalping", label: "Scalping Engine", icon: Activity, group: "Monitoring" },
  { id: "meme", label: "Meme Radar", icon: Rocket, group: "Monitoring" },
  { id: "whale", label: "Whale Tracker", icon: Waves, group: "Monitoring" },
  { id: "news", label: "News", icon: Newspaper, group: "Monitoring" },
  { id: "telegram", label: "Telegram Manager", icon: Send, group: "Management" },
  { id: "signals", label: "Signals History", icon: History, group: "Management" },
  { id: "referral", label: "Referral", icon: Gift, group: "Management" },
  { id: "channel-manager", label: "Channel Manager", icon: Users, group: "Management" },
];

interface SidebarProps {
  current: PageId;
  onNavigate: (page: PageId) => void;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ current, onNavigate, open, onClose }: SidebarProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const groups = [...new Set(NAV_ITEMS.map((n) => n.group))];

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 h-screen flex-col border-r border-slate-800/60 bg-[#0d1320]/80 backdrop-blur-xl flex-shrink-0">
        <SidebarContent current={current} onNavigate={onNavigate} time={time} />
      </aside>

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-72 flex flex-col border-r border-slate-800/60 bg-[#0d1320] backdrop-blur-xl transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-3 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent current={current} onNavigate={onNavigate} time={time} />
      </aside>
    </>
  );
}

function SidebarContent({
  current,
  onNavigate,
  time,
}: {
  current: PageId;
  onNavigate: (page: PageId) => void;
  time: Date;
}) {
  const groups = [...new Set(NAV_ITEMS.map((n) => n.group))];

  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center glow-cyan">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">Crypto Command</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Admin Dashboard</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((group) => (
          <div key={group}>
            <p className="px-3 mb-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
              {group}
            </p>
            <div className="space-y-1">
              {NAV_ITEMS.filter((n) => n.group === group).map((item) => {
                const Icon = item.icon;
                const isActive = current === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="pulse-dot">
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
            </span>
            <span className="text-xs text-slate-500">System Online</span>
          </div>
          <span className="text-xs font-mono text-slate-600">
            {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </>
  );
}
