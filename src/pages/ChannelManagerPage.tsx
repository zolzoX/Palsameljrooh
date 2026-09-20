import { useEffect, useState, useCallback, useRef } from "react";
import { Users, Search, Play, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Radio, ArrowRight, Trash2, UserCheck, UserX, Gauge } from "lucide-react";
import { supabase, EDGE_FUNCTION_BASE } from "@/lib/supabase";
import { LoadingState, EmptyState } from "@/components/States";

interface TelegramChannel {
  id: string;
  channel_username: string;
  channel_id: string | null;
  title: string | null;
  member_count: number;
  status: string;
  created_at: string;
}

interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_bot: boolean;
}

interface InviteJob {
  id: string;
  source_channel_id: string;
  target_channel_username: string;
  target_bot_id: string;
  total_users: number;
  processed: number;
  succeeded: number;
  failed: number;
  rate_limited: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface InviteJobItem {
  id: string;
  job_id: string;
  member_user_id: string | null;
  member_username: string | null;
  status: string;
  error_message: string | null;
  processed_at: string | null;
}

interface Bot {
  id: string;
  name: string;
  bot_token: string;
}

export default function ChannelManagerPage() {
  const [channelInput, setChannelInput] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [channel, setChannel] = useState<TelegramChannel | null>(null);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [targetChannel, setTargetChannel] = useState("");
  const [selectedBot, setSelectedBot] = useState("");
  const [targetMode, setTargetMode] = useState<"all" | "custom">("all");
  const [customCount, setCustomCount] = useState(10);
  const [job, setJob] = useState<InviteJob | null>(null);
  const [jobItems, setJobItems] = useState<InviteJobItem[]>([]);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBots = useCallback(async () => {
    const { data } = await supabase.from("telegram_bots").select("id, name, bot_token").eq("is_active", true).eq("is_connected", true);
    if (data) setBots(data as Bot[]);
  }, []);

  useEffect(() => { fetchBots(); }, [fetchBots]);

  const scrapeChannel = async () => {
    if (!channelInput.trim()) return;
    setScraping(true);
    setScrapeError(null);
    setChannel(null);
    setMembers([]);
    setJob(null);
    setJobItems([]);
    try {
      const resp = await fetch(`${EDGE_FUNCTION_BASE}/telegram-scraper`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channelUsername: channelInput }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setScrapeError(data.error ?? "Failed to scrape channel");
      } else {
        setChannel(data.channel as TelegramChannel);
        setMembers(data.members as ChannelMember[]);
      }
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "Unknown error");
    }
    setScraping(false);
  };

  const startProcess = async () => {
    if (!channel || !targetChannel || !selectedBot) return;
    setStarting(true);

    const usersToProcess = targetMode === "all" ? members.length : Math.min(customCount, members.length);
    const selectedMembers = members.slice(0, usersToProcess);

    // Create job
    const { data: newJob } = await supabase.from("invite_jobs").insert({
      source_channel_id: channel.id,
      target_channel_username: targetChannel,
      target_bot_id: selectedBot,
      total_users: selectedMembers.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      rate_limited: 0,
      status: "pending",
    }).select("*").maybeSingle();

    if (!newJob) { setStarting(false); return; }
    setJob(newJob as InviteJob);

    // Create job items
    const items = selectedMembers.map((m) => ({
      job_id: newJob.id,
      member_user_id: m.user_id,
      member_username: m.username,
      status: "pending",
    }));
    await supabase.from("invite_job_items").insert(items);

    // Trigger the inviter edge function
    try {
      await fetch(`${EDGE_FUNCTION_BASE}/telegram-inviter`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId: newJob.id }),
      });
    } catch { /* will poll for updates */ }

    setStarting(false);
    // Start polling for job updates
    startPolling(newJob.id);
  };

  const startPolling = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data: jobData } = await supabase.from("invite_jobs").select("*").eq("id", jobId).maybeSingle();
      if (jobData) {
        setJob(jobData as InviteJob);
        if ((jobData as InviteJob).status === "completed" || (jobData as InviteJob).status === "failed") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      }
      const { data: items } = await supabase.from("invite_job_items").select("*").eq("job_id", jobId).order("id", { ascending: false }).limit(50);
      if (items) setJobItems(items as InviteJobItem[]);
    }, 2000);
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const resetAll = () => {
    setChannel(null);
    setMembers([]);
    setJob(null);
    setJobItems([]);
    setChannelInput("");
    setTargetChannel("");
    setTargetMode("all");
    setCustomCount(10);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const progress = job && job.total_users > 0 ? Math.round((job.processed / job.total_users) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Channel Manager</h3>
          <p className="text-xs text-slate-500 hidden sm:block">Scrape public channels, view members, and send invite links to your target channel</p>
        </div>
      </div>

      {/* Step 1: Source Channel Input */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-xs font-bold">1</span>
          <h4 className="text-sm font-semibold text-white">Source Channel</h4>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <Search className="w-4 h-4 text-slate-500" />
            <input type="text" value={channelInput} onChange={(e) => setChannelInput(e.target.value)}
              placeholder="@channelusername or https://t.me/channelname"
              className="bg-transparent text-sm text-white placeholder-slate-600 outline-none flex-1"
              onKeyDown={(e) => e.key === "Enter" && scrapeChannel()} />
          </div>
          <button onClick={scrapeChannel} disabled={scraping || !channelInput.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-sm font-medium disabled:opacity-50">
            {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {scraping ? "Scraping..." : "Fetch Members"}
          </button>
        </div>
        {scrapeError && (
          <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{scrapeError}</p>
          </div>
        )}
        <p className="text-[10px] text-slate-600">
          The bot must be a member of the channel to fetch data. For full member list scraping, configure a Telegram session string (MTProto userbot).
        </p>
      </div>

      {/* Step 2: Results — Member List */}
      {channel && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-xs font-bold">2</span>
              <h4 className="text-sm font-semibold text-white">Fetched Members</h4>
            </div>
            <button onClick={resetAll} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/40">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Channel</p>
              <p className="text-sm font-bold text-white truncate">{channel.title ?? channel.channel_username}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/40">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total Members</p>
              <p className="text-sm font-bold text-cyan-400">{channel.member_count.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/40">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Fetched</p>
              <p className="text-sm font-bold text-green-400">{members.length}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/40">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Status</p>
              <p className="text-sm font-bold text-amber-400 capitalize">{channel.status}</p>
            </div>
          </div>

          {/* Member Preview List */}
          {members.length > 0 ? (
            <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-900/40 border border-slate-800/60">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-900/80 backdrop-blur">
                  <tr className="border-b border-slate-800/60">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-600 uppercase">#</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-600 uppercase">Username</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-600 uppercase">Name</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-600 uppercase">User ID</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-600 uppercase">Bot</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={m.id} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                      <td className="px-3 py-2 text-xs text-slate-600">{i + 1}</td>
                      <td className="px-3 py-2 text-xs text-cyan-400 font-mono">{m.username ? `@${m.username}` : "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-300">{[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{m.user_id ?? "—"}</td>
                      <td className="px-3 py-2">{m.is_bot ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">BOT</span> : <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">USER</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No members fetched. The bot could only retrieve administrators (it needs admin rights in the channel for full member list).</p>
          )}

          {/* Step 3: Target Configuration */}
          <div className="pt-4 border-t border-slate-800/60 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-xs font-bold">3</span>
              <h4 className="text-sm font-semibold text-white">Target & Selection</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5 block">Target Channel</label>
                <input type="text" value={targetChannel} onChange={(e) => setTargetChannel(e.target.value)}
                  placeholder="@your_target_channel"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40" />
              </div>
              <div>
                <label className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5 block">Using Bot</label>
                <select value={selectedBot} onChange={(e) => setSelectedBot(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none">
                  <option value="">Select a bot...</option>
                  {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            {/* Selection Control */}
            <div>
              <label className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5 block">User Selection</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${targetMode === "all" ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400" : "bg-slate-800/40 border border-slate-700/40 text-slate-400"}`}>
                  <input type="radio" checked={targetMode === "all"} onChange={() => setTargetMode("all")} className="hidden" />
                  <UserCheck className="w-4 h-4" />
                  <span className="text-sm font-medium">All Users ({members.length})</span>
                </label>
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${targetMode === "custom" ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400" : "bg-slate-800/40 border border-slate-700/40 text-slate-400"}`}>
                  <input type="radio" checked={targetMode === "custom"} onChange={() => setTargetMode("custom")} className="hidden" />
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium">Custom:</span>
                  <input type="number" min={1} max={members.length} value={customCount}
                    onChange={(e) => setCustomCount(Math.max(1, parseInt(e.target.value) || 1))}
                    onClick={() => setTargetMode("custom")}
                    className="w-16 px-2 py-0.5 rounded bg-slate-900/60 text-sm text-white outline-none border border-slate-700/40" />
                </label>
              </div>
            </div>

            {/* Step 4: Start Button */}
            <button onClick={startProcess} disabled={starting || !targetChannel || !selectedBot || members.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/15 to-blue-600/15 text-cyan-400 border border-cyan-500/20 hover:from-cyan-500/25 hover:to-blue-600/25 transition-all text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
              {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {starting ? "Starting..." : `Start Process — ${targetMode === "all" ? members.length : Math.min(customCount, members.length)} Users`}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Progress Log */}
      {job && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-xs font-bold">4</span>
            <h4 className="text-sm font-semibold text-white">Progress Log</h4>
            {job.status === "running" && <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-semibold"><Radio className="w-3 h-3 animate-pulse" />LIVE</span>}
            {job.status === "completed" && <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-semibold"><CheckCircle2 className="w-3 h-3" />COMPLETED</span>}
            {job.status === "failed" && <span className="flex items-center gap-1.5 text-[10px] text-red-400 font-semibold"><XCircle className="w-3 h-3" />FAILED</span>}
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400">{job.processed} / {job.total_users} processed</span>
              <span className="text-xs font-bold text-cyan-400">{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/10">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Success</span>
              </div>
              <p className="text-lg font-bold text-green-400">{job.succeeded}</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Failed</span>
              </div>
              <p className="text-lg font-bold text-red-400">{job.failed}</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Rate Limited</span>
              </div>
              <p className="text-lg font-bold text-amber-400">{job.rate_limited}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-700/20 border border-slate-700/20">
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Remaining</span>
              </div>
              <p className="text-lg font-bold text-slate-300">{job.total_users - job.processed}</p>
            </div>
          </div>

          {/* Real-time Log */}
          <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-900/60 border border-slate-800/60 p-3 space-y-1.5">
            {jobItems.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4">Waiting for updates...</p>
            ) : (
              jobItems.map((item) => {
                const icon = item.status === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  : item.status === "failed" ? <XCircle className="w-3.5 h-3.5 text-red-400" />
                  : item.status === "rate_limited" ? <Clock className="w-3.5 h-3.5 text-amber-400" />
                  : <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />;
                const color = item.status === "success" ? "text-green-400"
                  : item.status === "failed" ? "text-red-400"
                  : item.status === "rate_limited" ? "text-amber-400"
                  : "text-slate-500";
                return (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    {icon}
                    <span className={`${color} font-mono`}>
                      {item.member_username ? `@${item.member_username}` : item.member_user_id ?? "unknown"}
                    </span>
                    <span className={color}>— {item.status}</span>
                    {item.error_message && <span className="text-slate-600 truncate">({item.error_message})</span>}
                    {item.processed_at && <span className="text-slate-700 ml-auto">{new Date(item.processed_at).toLocaleTimeString("en-US")}</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {!channel && !scraping && !scrapeError && (
        <div className="glass-card p-8">
          <EmptyState message="Enter a public Telegram channel username above to start scraping members." />
        </div>
      )}
    </div>
  );
}
