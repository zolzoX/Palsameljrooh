import { useEffect, useState, useCallback } from "react";
import { Send, Plus, Trash2, Check, X, Bot, Zap, RefreshCw, Settings, Crown, Wallet, User, MessageSquare, Link2 } from "lucide-react";
import { supabase, EDGE_FUNCTION_BASE } from "@/lib/supabase";
import type { TelegramBot, BotEngineRoute, BotEngine, SignalConfig, VipPlan } from "@/lib/types";
import { TIMEFRAMES } from "@/lib/types";
import { LoadingState } from "@/components/States";

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

export default function TelegramPage() {
  const [bots, setBots] = useState<TelegramBot[]>([]);
  const [engines, setEngines] = useState<BotEngine[]>([]);
  const [routes, setRoutes] = useState<BotEngineRoute[]>([]);
  const [configs, setConfigs] = useState<SignalConfig[]>([]);
  const [allPlans, setAllPlans] = useState<VipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [showConfig, setShowConfig] = useState(false);
  const [webhookStatuses, setWebhookStatuses] = useState<Record<string, string>>({});

  // New bot form
  const [newBotName, setNewBotName] = useState("");
  const [newBotToken, setNewBotToken] = useState("");
  const [newBotChatId, setNewBotChatId] = useState("");

  // Edit bot states
  const [editTokens, setEditTokens] = useState<Record<string, string>>({});
  const [editChatIds, setEditChatIds] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    const [{ data: botData }, { data: engData }, { data: routeData }, { data: cfgData }, { data: planData }] = await Promise.all([
      supabase.from("telegram_bots").select("*").order("created_at"),
      supabase.from("bot_engines").select("*").order("slug"),
      supabase.from("bot_engine_routes").select("*"),
      supabase.from("signal_config").select("*").order("timeframe"),
      supabase.from("vip_plans").select("*").order("sort_order"),
    ]);
    if (planData) setAllPlans(planData as VipPlan[]);
    if (botData) {
      setBots(botData as TelegramBot[]);
      const tokens: Record<string, string> = {};
      const chatIds: Record<string, string> = {};
      for (const b of botData as TelegramBot[]) {
        tokens[b.id] = b.bot_token;
        chatIds[b.id] = b.chat_id;
      }
      setEditTokens(tokens);
      setEditChatIds(chatIds);
    }
    if (engData) setEngines(engData as BotEngine[]);
    if (routeData) setRoutes(routeData as BotEngineRoute[]);
    if (cfgData) setConfigs(cfgData as SignalConfig[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addBot = async () => {
    if (!newBotName || !newBotToken || !newBotChatId) return;
    setSaving(true);
    const { data } = await supabase.from("telegram_bots").insert({
      name: newBotName,
      bot_token: newBotToken,
      chat_id: newBotChatId,
      is_active: true,
      is_connected: true,
    }).select("*").single();
    if (data) {
      for (const eng of engines) {
        await supabase.from("bot_engine_routes").insert({
          bot_id: (data as TelegramBot).id,
          engine_slug: eng.slug,
          is_allowed: true,
        });
      }
    }
    setNewBotName("");
    setNewBotToken("");
    setNewBotChatId("");
    await fetchData();
    setSaving(false);
  };

  const updateBot = async (id: string) => {
    setSaving(true);
    await supabase.from("telegram_bots").update({
      bot_token: editTokens[id] ?? "",
      chat_id: editChatIds[id] ?? "",
      is_connected: true,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    await fetchData();
    setSaving(false);
  };

  const deleteBot = async (id: string) => {
    await supabase.from("bot_engine_routes").delete().eq("bot_id", id);
    await supabase.from("vip_plans").delete().eq("bot_id", id);
    await supabase.from("telegram_bots").delete().eq("id", id);
    await fetchData();
  };

  const toggleBotActive = async (bot: TelegramBot) => {
    await supabase.from("telegram_bots").update({ is_active: !bot.is_active }).eq("id", bot.id);
    await fetchData();
  };

  const toggleChannelType = async (bot: TelegramBot) => {
    const newType = bot.channel_type === "free" ? "vip" : "free";
    const newRole = newType === "free" ? "free_signal" : "vip_signal";
    await supabase.from("telegram_bots").update({ channel_type: newType, bot_role: newRole }).eq("id", bot.id);
    await fetchData();
  };

  const toggleEngineRoute = async (botId: string, engineSlug: string, currentAllowed: boolean) => {
    const existing = routes.find((r) => r.bot_id === botId && r.engine_slug === engineSlug);
    if (existing) {
      await supabase.from("bot_engine_routes").update({ is_allowed: !currentAllowed }).eq("id", existing.id);
    } else {
      await supabase.from("bot_engine_routes").insert({
        bot_id: botId,
        engine_slug: engineSlug,
        is_allowed: true,
      });
    }
    await fetchData();
  };

  const sendTest = async (botId: string) => {
    setTesting(botId);
    const bot = bots.find((b) => b.id === botId);
    try {
      const resp = await fetch(`${EDGE_FUNCTION_BASE}/telegram-send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Test alert from Crypto Command — bot "${bot?.name}" is connected!`,
          botId,
        }),
      });
      const data = await resp.json();
      setTestResults((prev) => ({
        ...prev,
        [botId]: resp.ok && data.success ? "Sent successfully!" : `Failed: ${data.error ?? "Unknown"}`,
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [botId]: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      }));
    }
    setTesting(null);
  };

  const updateConfig = async (cfg: SignalConfig, field: keyof SignalConfig, value: number) => {
    await supabase.from("signal_config").update({ [field]: value }).eq("id", cfg.id);
    await fetchData();
  };

  // Per-bot VIP subscription config save
  const saveBotVipConfig = async (bot: TelegramBot) => {
    setSaving(true);
    await supabase.from("telegram_bots").update({
      sub_bot_token: bot.sub_bot_token,
      sub_bot_username: bot.sub_bot_username,
      sub_welcome_message: bot.sub_welcome_message,
      sub_wallet_trc20: bot.sub_wallet_trc20,
      sub_wallet_bep20: bot.sub_wallet_bep20,
      sub_wallet_erc20: bot.sub_wallet_erc20,
      sub_admin_username: bot.sub_admin_username,
      updated_at: new Date().toISOString(),
    }).eq("id", bot.id);
    await fetchData();
    setSaving(false);
  };

  // Set webhook for a specific VIP bot's subscription bot (includes bot_id query param)
  const setPerBotWebhook = async (bot: TelegramBot) => {
    if (!bot.sub_bot_token) {
      setWebhookStatuses((prev) => ({ ...prev, [bot.id]: "Error: Enter the subscription bot token first" }));
      return;
    }
    setSaving(true);
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vip-bot?bot_id=${bot.id}`;
    try {
      const resp = await fetch(`https://api.telegram.org/bot${bot.sub_bot_token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await resp.json();
      if (data.ok) {
        setWebhookStatuses((prev) => ({ ...prev, [bot.id]: "Connected! Bot will respond to /start" }));
      } else {
        setWebhookStatuses((prev) => ({ ...prev, [bot.id]: `Error: ${data.description ?? "Unknown"}` }));
      }
    } catch (err) {
      setWebhookStatuses((prev) => ({ ...prev, [bot.id]: `Error: ${err instanceof Error ? err.message : "Network"}` }));
    }
    setSaving(false);
    setTimeout(() => setWebhookStatuses((prev) => { const n = { ...prev }; delete n[bot.id]; return n; }), 5000);
  };

  // Link a free channel bot to a VIP channel bot
  const linkToVipBot = async (freeBot: TelegramBot, vipBotId: string) => {
    await supabase.from("telegram_bots").update({ linked_vip_bot_id: vipBotId || null }).eq("id", freeBot.id);
    await fetchData();
  };

  // Per-bot plan management
  const updatePlan = async (plan: VipPlan, field: keyof VipPlan, value: string | number | boolean) => {
    await supabase.from("vip_plans").update({ [field]: value }).eq("id", plan.id);
    await fetchData();
  };

  const addPlanForBot = async (botId: string) => {
    await supabase.from("vip_plans").insert({
      name: "New Plan",
      duration: "30d",
      price_usdt: 50,
      sort_order: allPlans.filter((p) => p.bot_id === botId).length + 1,
      is_active: true,
      bot_id: botId,
    });
    await fetchData();
  };

  const deletePlan = async (planId: string) => {
    await supabase.from("vip_plans").delete().eq("id", planId);
    await fetchData();
  };

  // Update a bot's sub_ field in local state
  const updateBotField = (botId: string, field: keyof TelegramBot, value: string) => {
    setBots((prev) => prev.map((b) => b.id === botId ? { ...b, [field]: value } : b));
  };

  if (loading) return <LoadingState message="Loading Telegram manager..." />;

  const vipBots = bots.filter((b) => b.channel_type === "vip");

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Telegram Bot Manager</h3>
            <p className="text-xs text-slate-500 hidden sm:block">Add bots, route engines, and configure VIP channels per bot</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/60 text-slate-300 border border-slate-700/40 hover:text-white transition-all text-sm font-medium flex-shrink-0"
          >
            <Settings className="w-4 h-4" />
            {showConfig ? "Hide" : "Indicator"} Settings
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-semibold text-white">How VIP Channels Work</h4>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-center">
          <div className="flex-1 min-w-[100px] rounded-lg bg-amber-500/5 border border-amber-500/20 p-2">
            <p className="text-[11px] font-semibold text-amber-400">Free Channel</p>
            <p className="text-[9px] text-slate-600">3 unlocked + 1 locked signal. Link it to a VIP channel.</p>
          </div>
          <span className="text-slate-600 text-sm">→</span>
          <div className="flex-1 min-w-[100px] rounded-lg bg-cyan-500/5 border border-cyan-500/20 p-2">
            <p className="text-[11px] font-semibold text-cyan-400">VIP Channel</p>
            <p className="text-[9px] text-slate-600">Full signals. Requires its own subscription bot.</p>
          </div>
          <span className="text-slate-600 text-sm">→</span>
          <div className="flex-1 min-w-[100px] rounded-lg bg-green-500/5 border border-green-500/20 p-2">
            <p className="text-[11px] font-semibold text-green-400">Subscription Bot</p>
            <p className="text-[9px] text-slate-600">Plans, wallets, welcome message. Set per VIP channel.</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">Toggle a bot to "VIP" to configure its subscription bot. Toggle a bot to "Free" to link it to a VIP channel.</p>
      </div>

      {/* Indicator Config Panel */}
      {showConfig && (
        <div className="glass-card p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Indicator Settings per Timeframe</h4>
          <p className="text-xs text-slate-500 mb-4">Configure RSI, EMA, MACD, and Bollinger Band parameters for each timeframe.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/60">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-600 uppercase">TF</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">RSI Overbought</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">RSI Oversold</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">EMA Fast</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">EMA Slow</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">MACD Fast</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">MACD Slow</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">MACD Signal</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">BB Period</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-600 uppercase">BB Std Dev</th>
                </tr>
              </thead>
              <tbody>
                {TIMEFRAMES.map((tf) => {
                  const cfg = configs.find((c) => c.timeframe === tf.id);
                  if (!cfg) return null;
                  return (
                    <tr key={tf.id} className="border-b border-slate-800/30">
                      <td className="px-3 py-2 font-bold text-cyan-400">{tf.label}</td>
                      <td className="px-2 py-2"><input type="number" defaultValue={cfg.rsi_overbought} onBlur={(e) => updateConfig(cfg, "rsi_overbought", parseFloat(e.target.value))} className="w-16 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                      <td className="px-2 py-2"><input type="number" defaultValue={cfg.rsi_oversold} onBlur={(e) => updateConfig(cfg, "rsi_oversold", parseFloat(e.target.value))} className="w-16 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                      <td className="px-2 py-2"><input type="number" defaultValue={cfg.ema_fast_period} onBlur={(e) => updateConfig(cfg, "ema_fast_period", parseInt(e.target.value))} className="w-14 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                      <td className="px-2 py-2"><input type="number" defaultValue={cfg.ema_slow_period} onBlur={(e) => updateConfig(cfg, "ema_slow_period", parseInt(e.target.value))} className="w-14 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                      <td className="px-2 py-2"><input type="number" defaultValue={cfg.macd_fast} onBlur={(e) => updateConfig(cfg, "macd_fast", parseInt(e.target.value))} className="w-14 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                      <td className="px-2 py-2"><input type="number" defaultValue={cfg.macd_slow} onBlur={(e) => updateConfig(cfg, "macd_slow", parseInt(e.target.value))} className="w-14 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                      <td className="px-2 py-2"><input type="number" defaultValue={cfg.macd_signal} onBlur={(e) => updateConfig(cfg, "macd_signal", parseInt(e.target.value))} className="w-14 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                      <td className="px-2 py-2"><input type="number" defaultValue={cfg.bb_period} onBlur={(e) => updateConfig(cfg, "bb_period", parseInt(e.target.value))} className="w-14 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                      <td className="px-2 py-2"><input type="number" step="0.1" defaultValue={cfg.bb_std_dev} onBlur={(e) => updateConfig(cfg, "bb_std_dev", parseFloat(e.target.value))} className="w-14 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/40 text-center text-white" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add New Bot */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4 text-cyan-400" />
          <h4 className="text-sm font-semibold text-white">Add New Telegram Bot</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={newBotName}
            onChange={(e) => setNewBotName(e.target.value)}
            placeholder="Bot name (e.g. Meme Coin Free)"
            className="px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/40"
          />
          <input
            type="password"
            value={newBotToken}
            onChange={(e) => setNewBotToken(e.target.value)}
            placeholder="Bot token (123456:ABC...)"
            className="px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/40"
          />
          <input
            type="text"
            value={newBotChatId}
            onChange={(e) => setNewBotChatId(e.target.value)}
            placeholder="Chat ID (-100123... or @channel)"
            className="px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/40"
          />
        </div>
        <button
          onClick={addBot}
          disabled={!newBotName || !newBotToken || !newBotChatId || saving}
          className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Zap className="w-4 h-4 animate-pulse" /> : <Plus className="w-4 h-4" />}
          Add Bot
        </button>
      </div>

      {/* Bot Cards */}
      {bots.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-slate-600">
          No bots configured yet. Add your first bot above.
        </div>
      ) : (
        <div className="space-y-4">
          {bots.map((bot) => {
            const botRoutes = routes.filter((r) => r.bot_id === bot.id);
            const botPlans = allPlans.filter((p) => p.bot_id === bot.id);
            const linkedVipBot = bots.find((b) => b.id === bot.linked_vip_bot_id);
            return (
              <div key={bot.id} className="glass-card p-5">
                {/* Bot Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bot.is_connected ? "bg-green-500/10 text-green-400" : "bg-slate-700/30 text-slate-500"}`}>
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white">{bot.name}</p>
                        <span className={`flex items-center gap-1 text-[10px] font-semibold ${bot.is_connected ? "text-green-400" : "text-slate-600"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${bot.is_connected ? "bg-green-400" : "bg-slate-600"}`} />
                          {bot.is_connected ? "CONNECTED" : "OFFLINE"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-600 font-mono">{bot.chat_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleBotActive(bot)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        bot.is_active
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : "bg-slate-800/40 text-slate-500 border border-slate-700/40"
                      }`}
                    >
                      {bot.is_active ? "Active" : "Inactive"}
                    </button>
                    <button
                      onClick={() => toggleChannelType(bot)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        bot.channel_type === "free"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                      }`}
                      title={bot.channel_type === "free" ? "Free channel: 3 unlocked + 1 locked" : "VIP channel: full signals + subscription bot"}
                    >
                      <Crown className="w-3 h-3" />
                      {bot.channel_type === "free" ? "Free" : "VIP"}
                    </button>
                    <button
                      onClick={() => sendTest(bot.id)}
                      disabled={testing === bot.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 text-slate-300 border border-slate-700/40 hover:text-white text-xs font-medium disabled:opacity-50"
                    >
                      {testing === bot.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Test
                    </button>
                    <button
                      onClick={() => deleteBot(bot.id)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Test result */}
                {testResults[bot.id] && (
                  <p className={`text-xs mb-3 ${testResults[bot.id].startsWith("Sent") ? "text-green-400" : "text-red-400"}`}>
                    {testResults[bot.id]}
                  </p>
                )}

                {/* Editable token/chat */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-[10px] text-slate-600 uppercase tracking-wider mb-1 block">Bot Token</label>
                    <input
                      type="password"
                      value={editTokens[bot.id] ?? ""}
                      onChange={(e) => setEditTokens((prev) => ({ ...prev, [bot.id]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-600 uppercase tracking-wider mb-1 block">Chat ID</label>
                    <input
                      type="text"
                      value={editChatIds[bot.id] ?? ""}
                      onChange={(e) => setEditChatIds((prev) => ({ ...prev, [bot.id]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40"
                    />
                  </div>
                </div>
                <button
                  onClick={() => updateBot(bot.id)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 text-slate-300 border border-slate-700/40 hover:text-white text-xs font-medium mb-4"
                >
                  <Check className="w-3 h-3" />
                  Save Changes
                </button>

                {/* Engine Routing */}
                <div className="mb-4">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Monitoring Engines — toggle which engines send to this bot</p>
                  <div className="flex flex-wrap gap-2">
                    {engines.map((eng) => {
                      const route = botRoutes.find((r) => r.engine_slug === eng.slug);
                      const isAllowed = route?.is_allowed ?? false;
                      return (
                        <button
                          key={eng.id}
                          onClick={() => toggleEngineRoute(bot.id, eng.slug, isAllowed)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isAllowed
                              ? `${ENGINE_COLORS[eng.slug]} border border-current/20`
                              : "bg-slate-800/30 text-slate-600 border border-slate-700/20 hover:text-slate-400"
                          }`}
                        >
                          {isAllowed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {ENGINE_LABELS[eng.slug] ?? eng.slug}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* FREE BOT: Link to VIP Channel */}
                {bot.channel_type === "free" && (
                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 text-amber-400" />
                      <p className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">Link to VIP Channel</p>
                    </div>
                    <p className="text-[10px] text-slate-600">When a locked signal is posted here, the "Unlock VIP" button will point to this VIP channel's subscription bot.</p>
                    <select
                      value={bot.linked_vip_bot_id ?? ""}
                      onChange={(e) => linkToVipBot(bot, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-amber-500/40"
                    >
                      <option value="">— Select VIP Channel —</option>
                      {vipBots.map((vb) => (
                        <option key={vb.id} value={vb.id}>{vb.name}</option>
                      ))}
                    </select>
                    {linkedVipBot && (
                      <p className="text-[10px] text-green-400 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Linked to {linkedVipBot.name} — unlock button points to {linkedVipBot.sub_bot_username ?? "not configured yet"}
                      </p>
                    )}
                    {vipBots.length === 0 && (
                      <p className="text-[10px] text-slate-600">No VIP channels yet. Toggle a bot to "VIP" to create one.</p>
                    )}
                  </div>
                )}

                {/* VIP BOT: Subscription Bot Configuration */}
                {bot.channel_type === "vip" && (
                  <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Crown className="w-3.5 h-3.5 text-cyan-400" />
                      <p className="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">Subscription Bot for this VIP Channel</p>
                    </div>

                    {/* Sub bot token + username */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-600 mb-1 block">Subscription Bot Token <span className="text-red-400">*</span></label>
                        <input
                          type="password"
                          value={bot.sub_bot_token ?? ""}
                          onChange={(e) => updateBotField(bot.id, "sub_bot_token", e.target.value)}
                          placeholder="Token for the subscription bot"
                          className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-600 mb-1 block">Subscription Bot Link <span className="text-red-400">*</span></label>
                        <input
                          type="text"
                          value={bot.sub_bot_username ?? ""}
                          onChange={(e) => updateBotField(bot.id, "sub_bot_username", e.target.value)}
                          placeholder="https://t.me/your_subs_bot"
                          className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40"
                        />
                        <p className="text-[10px] text-slate-600 mt-1">This is the link on the "Unlock VIP" button in free channels</p>
                      </div>
                    </div>

                    {/* Welcome message */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-3 h-3 text-cyan-400" />
                        <label className="text-[10px] text-slate-600 uppercase tracking-wider">Welcome Message (shown on /start)</label>
                      </div>
                      <textarea
                        value={bot.sub_welcome_message ?? ""}
                        onChange={(e) => updateBotField(bot.id, "sub_welcome_message", e.target.value)}
                        placeholder={"Welcome to VIP!\n\nUnlock exclusive signals with full entry, stop loss, and targets.\n\nClick below to view plans and subscribe."}
                        rows={3}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40 resize-none"
                      />
                    </div>

                    {/* Wallets */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="w-3 h-3 text-cyan-400" />
                        <label className="text-[10px] text-slate-600 uppercase tracking-wider">USDT Payment Wallets</label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-600 mb-1 block">TRC20</label>
                          <input type="text" value={bot.sub_wallet_trc20 ?? ""} onChange={(e) => updateBotField(bot.id, "sub_wallet_trc20", e.target.value)} placeholder="T..." className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white font-mono outline-none focus:border-cyan-500/40" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 mb-1 block">BEP20</label>
                          <input type="text" value={bot.sub_wallet_bep20 ?? ""} onChange={(e) => updateBotField(bot.id, "sub_wallet_bep20", e.target.value)} placeholder="0x..." className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white font-mono outline-none focus:border-cyan-500/40" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 mb-1 block">ERC20</label>
                          <input type="text" value={bot.sub_wallet_erc20 ?? ""} onChange={(e) => updateBotField(bot.id, "sub_wallet_erc20", e.target.value)} placeholder="0x..." className="w-full px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white font-mono outline-none focus:border-cyan-500/40" />
                        </div>
                      </div>
                    </div>

                    {/* Admin username */}
                    <div>
                      <label className="text-[10px] text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Admin Username (receives payment proof)</label>
                      <input type="text" value={bot.sub_admin_username ?? ""} onChange={(e) => updateBotField(bot.id, "sub_admin_username", e.target.value)} placeholder="@tolerank" className="w-full md:w-64 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40" />
                    </div>

                    {/* Plans */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">Subscription Plans</label>
                        <button onClick={() => addPlanForBot(bot.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-medium hover:bg-cyan-500/20">
                          <Plus className="w-3 h-3" /> Add Plan
                        </button>
                      </div>
                      <div className="space-y-2">
                        {botPlans.length === 0 && <p className="text-[10px] text-slate-600">No plans yet. Click "Add Plan" to create one.</p>}
                        {botPlans.map((plan) => (
                          <div key={plan.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
                            <input type="text" defaultValue={plan.name} onBlur={(e) => updatePlan(plan, "name", e.target.value)} className="w-24 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-xs text-white" />
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-600">$</span>
                              <input type="number" defaultValue={plan.price_usdt} onBlur={(e) => updatePlan(plan, "price_usdt", parseFloat(e.target.value))} className="w-16 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-xs text-white text-center" />
                            </div>
                            <input type="text" defaultValue={plan.duration} onBlur={(e) => updatePlan(plan, "duration", e.target.value)} className="w-16 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-xs text-white text-center" />
                            <input type="text" defaultValue={plan.description ?? ""} onBlur={(e) => updatePlan(plan, "description", e.target.value)} placeholder="Description" className="flex-1 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-xs text-white" />
                            <button onClick={() => updatePlan(plan, "is_active", !plan.is_active)} className={`px-2 py-1.5 rounded-lg text-[10px] font-medium ${plan.is_active ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-slate-800/40 text-slate-500 border border-slate-700/40"}`}>
                              {plan.is_active ? "Active" : "Hidden"}
                            </button>
                            <button onClick={() => deletePlan(plan.id)} className="p-1 rounded text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Save + Connect buttons */}
                    <div className="flex items-center gap-3 flex-wrap pt-1">
                      <button
                        onClick={() => saveBotVipConfig(bot)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-sm font-medium disabled:opacity-50"
                      >
                        {saving ? <Zap className="w-4 h-4 animate-pulse" /> : <Check className="w-4 h-4" />}
                        Save Subscription Config
                      </button>
                      <button
                        onClick={() => setPerBotWebhook(bot)}
                        disabled={saving || !bot.sub_bot_token}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-all text-sm font-medium disabled:opacity-50"
                      >
                        <Zap className="w-4 h-4" />
                        Connect Bot to Telegram
                      </button>
                      {webhookStatuses[bot.id] && (
                        <span className={`text-xs ${webhookStatuses[bot.id].startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                          {webhookStatuses[bot.id]}
                        </span>
                      )}
                    </div>
                    {!bot.sub_bot_token && (
                      <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-amber-400" />
                        Required: Enter the subscription bot token and link, then click "Connect Bot to Telegram"
                      </p>
                    )}
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
