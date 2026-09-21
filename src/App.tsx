import { useEffect, useState, useRef } from "react";
import Sidebar, { type PageId } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import DashboardPage from "@/pages/DashboardPage";
import ScalpingPage from "@/pages/ScalpingPage";
import MemePage from "@/pages/MemePage";
import WhalePage from "@/pages/WhalePage";
import NewsPage from "@/pages/NewsPage";
import TelegramPage from "@/pages/TelegramPage";
import SignalsPage from "@/pages/SignalsPage";
import ReferralPage from "@/pages/ReferralPage";
import ChannelManagerPage from "@/pages/ChannelManagerPage";
import { EDGE_FUNCTION_BASE, supabase } from "@/lib/supabase";
import { Lock } from "lucide-react";

const PAGE_META: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "System overview and real-time monitoring" },
  scalping: { title: "Scalping Engine", subtitle: "RSI + EMA + MACD + Bollinger for top pairs" },
  meme: { title: "Meme Radar", subtitle: "Trending tokens from DexScreener" },
  whale: { title: "Whale Tracker", subtitle: "Large crypto movement alerts" },
  news: { title: "News", subtitle: "RSS feeds with sentiment analysis" },
  telegram: { title: "Telegram Manager", subtitle: "Bot configuration and channel routing" },
  signals: { title: "Signals History", subtitle: "Auto-generated signals delivered to Telegram" },
  referral: { title: "Referral", subtitle: "Referral program management" },
  "channel-manager": { title: "Channel Manager", subtitle: "Scrape channels and manage invite queues" },
};

const SIGNAL_ENGINE_INTERVAL = 60000; // 1 minute

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [engineRunning, setEngineRunning] = useState(false);
  const [lastEngineRun, setLastEngineRun] = useState<string | null>(null);
  const engineRunningRef = useRef(false);

  const [authed, setAuthed] = useState(() => sessionStorage.getItem("admin_authed") === "true");
  const [passcode, setPasscode] = useState("");
  const [authError, setAuthError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const meta = PAGE_META[page];

  const handleNavigate = (p: PageId) => {
    setPage(p);
    setSidebarOpen(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(false);
    try {
      const { data } = await supabase.from("vip_settings").select("access_passcode").limit(1).maybeSingle();
      const stored = (data?.access_passcode as string) ?? "1994996";
      if (passcode.trim() === stored) {
        sessionStorage.setItem("admin_authed", "true");
        setAuthed(true);
      } else {
        setAuthError(true);
      }
    } catch {
      if (passcode.trim() === "1994996") {
        sessionStorage.setItem("admin_authed", "true");
        setAuthed(true);
      } else {
        setAuthError(true);
      }
    }
    setAuthLoading(false);
  };

  // Auto-run signal engine on interval (only when authed)
  useEffect(() => {
    if (!authed) return;
    const runEngine = async () => {
      if (engineRunningRef.current) return;
      engineRunningRef.current = true;
      setEngineRunning(true);
      try {
        await fetch(`${EDGE_FUNCTION_BASE}/signal-engine`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ timeframe: "1h" }),
        });
        setLastEngineRun(new Date().toLocaleTimeString("en-US"));
      } catch {
        // silent fail — will retry next interval
      }
      engineRunningRef.current = false;
      setEngineRunning(false);
    };

    // Run immediately on load
    runEngine();
    const interval = setInterval(runEngine, SIGNAL_ENGINE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (!authed) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-[#1a0505] via-[#0a0e17] to-[#1a0505] px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 shadow-lg shadow-red-600/30 ring-1 ring-red-500/20">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Admin Access</h1>
            <p className="mt-1 text-sm text-red-300/70">Enter your passcode to access the control panel</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={passcode}
                onChange={(e) => { setPasscode(e.target.value); setAuthError(false); }}
                placeholder="Enter passcode"
                autoFocus
                className="w-full rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-white placeholder-red-400/50 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
              />
              {authError && (
                <p className="mt-2 text-sm text-red-400">Incorrect passcode. Please try again.</p>
              )}
            </div>
            <button
              type="submit"
              disabled={authLoading || !passcode}
              className="w-full rounded-xl bg-gradient-to-r from-red-600 to-rose-700 px-4 py-3 font-semibold text-white shadow-lg shadow-red-600/30 transition hover:from-red-500 hover:to-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {authLoading ? "Verifying..." : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0e17]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        current={page}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <div className="flex-1 overflow-y-auto">
          {page === "dashboard" && <DashboardPage engineRunning={engineRunning} lastEngineRun={lastEngineRun} />}
          {page === "scalping" && <ScalpingPage />}
          {page === "meme" && <MemePage />}
          {page === "whale" && <WhalePage />}
          {page === "news" && <NewsPage />}
          {page === "telegram" && <TelegramPage />}
          {page === "signals" && <SignalsPage />}
          {page === "referral" && <ReferralPage />}
          {page === "channel-manager" && <ChannelManagerPage />}
        </div>
      </main>
    </div>
  );
}
