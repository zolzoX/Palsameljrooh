import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SignalPayload {
  message?: string;
  engineSlug?: string;
  botId?: string;
  signalId?: string;
  signalType?: "signal" | "whale" | "news" | "meme" | "digest";
  pair?: string;
  sentiment?: string;
  indicators?: string[];
  timeframe?: string;
  price?: number;
  priceChange?: number;
  sourceUrl?: string;
  digestTitle?: string;
  digestItems?: Array<{ title: string; detail: string; sentiment: string }>;
}

const ENGINE_TITLES: Record<string, string> = {
  scalping: "SIGNAL ALERT",
  whale: "WHALE ALERT",
  news: "NEWS ALERT",
  meme: "MEME ALERT",
};

function formatSignalCaption(p: SignalPayload): string {
  if (p.engineSlug === "scalping") {
    return p.message ?? "";
  }
  const isBull = p.sentiment === "bullish";
  const dirEmoji = isBull ? "\u{1F7E2}" : p.sentiment === "bearish" ? "\u{1F534}" : "\u{26AA}";
  const dirLabel = isBull ? "Long" : p.sentiment === "bearish" ? "Short" : "Neutral";
  const pairStr = p.pair ?? "";
  let msg = `#${pairStr} - ${dirLabel} ${dirEmoji}\n\n`;
  if (p.message) msg += `${p.message}`;
  return msg;
}

function formatDigestCaption(p: SignalPayload): string {
  let msg = `<b>SIGNAL DIGEST</b>\n${p.digestTitle ?? "Market Summary"}\n\n`;
  for (const item of p.digestItems ?? []) {
    msg += `<b>${item.title}</b>\n${item.detail}\n\n`;
  }
  return msg;
}

// Fetch real klines from Binance
async function fetchKlines(symbol: string, interval: string, limit = 30): Promise<Array<{ o: number; h: number; l: number; c: number; v: number }>> {
  try {
    const resp = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    const raw = await resp.json() as Array<Array<string | number>>;
    return raw.map((k) => ({ o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) }));
  } catch { return []; }
}

function computeEMAArrayChart(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) result.push(closes[i] * k + result[i - 1] * (1 - k));
  return result;
}

function parseTradeLevels(message: string): { entry?: number; stopLoss?: number; takeProfits?: number[] } {
  const entryMatch = message.match(/Entry:\s*\$?([\d.eE+-]+)/);
  const slMatch = message.match(/Stop Loss:\s*\$?([\d.eE+-]+)/);
  const tpMatches = [...message.matchAll(/Target \d:\s*\$?([\d.eE+-]+)/g)];
  return {
    entry: entryMatch ? parseFloat(entryMatch[1]) : undefined,
    stopLoss: slMatch ? parseFloat(slMatch[1]) : undefined,
    takeProfits: tpMatches.map((m) => parseFloat(m[1])),
  };
}

function buildCandlestickChartUrl(
  candles: Array<{ o: number; h: number; l: number; c: number }>,
  closes: number[],
  pairLabel: string,
  sentiment: string,
  timeframe: string,
  indicators: string[],
  engineTitle: string,
  entryPrice?: number,
  stopLoss?: number,
  takeProfits?: number[],
): string {
  const displayCandles = candles.slice(-30);
  const displayCloses = closes.slice(-30);
  const candleData = displayCandles.map((c, i) => ({ x: i, o: c.o, h: c.h, l: c.l, c: c.c }));
  const emaFastArr = computeEMAArrayChart(displayCloses, 12);
  const emaSlowArr = computeEMAArrayChart(displayCloses, 26);

  const period = 20;
  const bbUpper: number[] = [];
  const bbLower: number[] = [];
  for (let i = 0; i < displayCloses.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = displayCloses.slice(start, i + 1);
    const mid = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    bbUpper.push(mid + 2 * sd);
    bbLower.push(mid - 2 * sd);
  }

  const labels = displayCandles.map((_, i) => i);
  const datasets: Array<Record<string, unknown>> = [
    {
      type: "candlestick",
      label: pairLabel,
      data: candleData,
      color: { up: "rgba(34,197,94,0.9)", down: "rgba(239,68,68,0.9)", unchanged: "rgba(148,163,184,0.9)" },
      borderColor: { up: "rgb(34,197,94)", down: "rgb(239,68,68)", unchanged: "rgb(148,163,184)" },
    },
    {
      type: "line", label: "EMA 12", data: emaFastArr.map((y, x) => ({ x, y })),
      borderColor: "rgba(34,211,238,0.8)", backgroundColor: "transparent",
      borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3,
    },
    {
      type: "line", label: "EMA 26", data: emaSlowArr.map((y, x) => ({ x, y })),
      borderColor: "rgba(245,158,11,0.8)", backgroundColor: "transparent",
      borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3,
    },
    {
      type: "line", label: "BB Upper", data: bbUpper.map((y, x) => ({ x, y })),
      borderColor: "rgba(100,116,139,0.3)", backgroundColor: "transparent",
      borderWidth: 1, pointRadius: 0, fill: false, borderDash: [4, 4],
    },
    {
      type: "line", label: "BB Lower", data: bbLower.map((y, x) => ({ x, y })),
      borderColor: "rgba(100,116,139,0.3)", backgroundColor: "transparent",
      borderWidth: 1, pointRadius: 0, fill: false, borderDash: [4, 4],
    },
  ];

  const annotations: Record<string, unknown> = {};
  if (entryPrice !== undefined && entryPrice > 0) {
    annotations.entry = { type: "line", yMin: entryPrice, yMax: entryPrice, borderColor: "rgba(34,211,238,0.9)", borderWidth: 2, borderDash: [6, 4], label: { display: true, content: "Entry", position: "start", color: "#22d3ee", font: { size: 10 } } };
  }
  if (stopLoss !== undefined && stopLoss > 0) {
    annotations.sl = { type: "line", yMin: stopLoss, yMax: stopLoss, borderColor: "rgba(239,68,68,0.9)", borderWidth: 2, borderDash: [6, 4], label: { display: true, content: "SL", position: "start", color: "#ef4444", font: { size: 10 } } };
  }
  if (takeProfits) {
    takeProfits.forEach((tp, i) => {
      if (tp > 0) {
        annotations[`tp${i + 1}`] = { type: "line", yMin: tp, yMax: tp, borderColor: "rgba(34,197,94,0.7)", borderWidth: 1.5, borderDash: [6, 4], label: { display: true, content: `TP${i + 1}`, position: "start", color: "#22c55e", font: { size: 10 } } };
      }
    });
  }

  const isBull = sentiment === "bullish";
  const sentimentText = isBull ? "BULLISH" : sentiment === "bearish" ? "BEARISH" : "NEUTRAL";
  const rsiW = indicators.includes("RSI") ? 2 : 0;
  const otherC = indicators.filter((i) => i !== "RSI").length;
  const strength = rsiW + otherC;
  const confidence = Math.min(100, Math.round((strength / 5) * 100));

  const chartConfig = {
    type: "candlestick",
    data: { labels, datasets },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: [`${engineTitle} — ${pairLabel}`, `${sentimentText} | Confidence: ${confidence}% | ${timeframe}`], color: "#ffffff", font: { size: 14 } },
        annotation: annotations,
        watermark: { text: "CryptoCommand", color: "rgba(148,163,184,0.06)", fontSize: 36, fontFamily: "sans-serif", rotation: -25, opacity: 0.3, alignX: "center", alignY: "center" },
      },
      scales: {
        x: { type: "linear", min: 0, max: labels.length - 1, grid: { color: "rgba(30,41,59,0.3)" }, ticks: { display: false } },
        y: { grid: { color: "rgba(30,41,59,0.4)" }, ticks: { color: "#64748b", font: { size: 9 } } },
      },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&v=3&w=600&h=400&bkg=rgb(15,23,42)`;
}

function buildPriceLineChartUrl(closes: number[], pairLabel: string, sentiment: string, engineTitle: string): string {
  const isBull = sentiment === "bullish";
  const lineColor = isBull ? "rgba(34,197,94,1)" : sentiment === "bearish" ? "rgba(239,68,68,1)" : "rgba(34,211,238,1)";
  const fillColor = isBull ? "rgba(34,197,94,0.12)" : sentiment === "bearish" ? "rgba(239,68,68,0.12)" : "rgba(34,211,238,0.12)";
  const sentimentText = isBull ? "BULLISH" : sentiment === "bearish" ? "BEARISH" : "NEUTRAL";

  const chartConfig = {
    type: "line",
    data: {
      labels: closes.map((_, i) => i),
      datasets: [{ label: pairLabel, data: closes, borderColor: lineColor, backgroundColor: fillColor, fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }],
    },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: [`${engineTitle} — ${pairLabel}`, sentimentText], color: "#ffffff", font: { size: 14 } }, watermark: { text: "CryptoCommand", color: "rgba(148,163,184,0.06)", fontSize: 36, fontFamily: "sans-serif", rotation: -25, opacity: 0.3, alignX: "center", alignY: "center" } },
      scales: { x: { display: false }, y: { grid: { color: "rgba(30,41,59,0.4)" }, ticks: { color: "#64748b", font: { size: 9 } } } },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&v=3&w=600&h=400&bkg=rgb(15,23,42)`;
}

async function getChartImageUrl(p: SignalPayload): Promise<string> {
  const pairLabel = p.pair ?? "CHART";
  const engineTitle = ENGINE_TITLES[p.engineSlug ?? ""] ?? "SIGNAL";
  const tf = p.timeframe ?? "1h";

  if (p.signalType === "digest") {
    const bullCount = (p.digestItems ?? []).filter((d) => d.sentiment === "bullish").length;
    const bearCount = (p.digestItems ?? []).filter((d) => d.sentiment === "bearish").length;
    const neutralCount = (p.digestItems ?? []).length - bullCount - bearCount;
    const config = {
      type: "doughnut",
      data: {
        labels: ["Bullish", "Bearish", "Neutral"],
        datasets: [{
          data: [bullCount, bearCount, neutralCount],
          backgroundColor: ["rgba(34,197,94,0.8)", "rgba(239,68,68,0.8)", "rgba(100,116,139,0.8)"],
          borderColor: ["rgb(34,197,94)", "rgb(239,68,68)", "rgb(100,116,139)"],
          borderWidth: 1,
        }],
      },
      options: {
        plugins: {
          legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 11 } } },
          title: { display: true, text: `Signal Digest — ${tf}`, color: "#ffffff", font: { size: 14 } },
          watermark: { text: "CryptoCommand", color: "rgba(148,163,184,0.06)", fontSize: 36, fontFamily: "sans-serif", rotation: -25, opacity: 0.3, alignX: "center", alignY: "center" },
        },
      },
    };
    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&v=3&w=600&h=400&bkg=rgb(15,23,42)`;
  }

  if (p.signalType === "news") {
    const isBull = p.sentiment === "bullish";
    const config = {
      type: "bar",
      data: {
        labels: ["Bullish", "Neutral", "Bearish"],
        datasets: [{
          data: [isBull ? 1 : 0, p.sentiment === "neutral" ? 1 : 0, !isBull && p.sentiment !== "neutral" ? 1 : 0],
          backgroundColor: ["rgba(34,197,94,0.7)", "rgba(100,116,139,0.7)", "rgba(239,68,68,0.7)"],
          borderColor: ["rgb(34,197,94)", "rgb(100,116,139)", "rgb(239,68,68)"],
          borderWidth: 1,
        }],
      },
      options: {
        plugins: { legend: { display: false }, title: { display: true, text: [engineTitle, isBull ? "BULLISH" : p.sentiment === "bearish" ? "BEARISH" : "NEUTRAL"], color: "#ffffff", font: { size: 14 } }, watermark: { text: "CryptoCommand", color: "rgba(148,163,184,0.06)", fontSize: 36, fontFamily: "sans-serif", rotation: -25, opacity: 0.3, alignX: "center", alignY: "center" } },
        scales: { x: { grid: { color: "rgba(30,41,59,0.3)" }, ticks: { color: "#94a3b8", font: { size: 11 } } }, y: { display: false } },
      },
    };
    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&v=3&w=600&h=400&bkg=rgb(15,23,42)`;
  }

  // For scalping signals: fetch real klines and build candlestick chart
  if ((p.engineSlug === "scalping" || (!p.signalType || p.signalType === "signal")) && p.pair) {
    const binanceSymbol = p.pair.replace("/", "");
    const candles = await fetchKlines(binanceSymbol, tf, 48);
    if (candles.length >= 10) {
      const closes = candles.map((c) => c.c);
      const levels = parseTradeLevels(p.message ?? "");
      return buildCandlestickChartUrl(candles, closes, pairLabel, p.sentiment ?? "neutral", tf, p.indicators ?? [], engineTitle, levels.entry, levels.stopLoss, levels.takeProfits);
    }
    return buildPriceLineChartUrl(candles.map((c) => c.c), pairLabel, p.sentiment ?? "neutral", engineTitle);
  }

  // For whale alerts: fetch BTC klines for context
  if (p.signalType === "whale" && p.pair) {
    const candles = await fetchKlines("BTCUSDT", "1h", 30);
    return buildPriceLineChartUrl(candles.map((c) => c.c), pairLabel, p.sentiment ?? "neutral", engineTitle);
  }

  // For meme tokens: try Binance, fallback to mock
  if (p.signalType === "meme" && p.pair) {
    const binanceSymbol = `${p.pair.replace("-RH", "")}USDT`;
    const candles = await fetchKlines(binanceSymbol, "1h", 30);
    if (candles.length >= 5) {
      return buildPriceLineChartUrl(candles.map((c) => c.c), pairLabel, p.sentiment ?? "neutral", engineTitle);
    }
    const isBull = p.sentiment === "bullish";
    const mockCloses = isBull ? [100, 102, 99, 105, 103, 108, 112, 110, 115, 120] : [120, 118, 115, 112, 110, 108, 105, 103, 100, 95];
    return buildPriceLineChartUrl(mockCloses, pairLabel, p.sentiment ?? "neutral", engineTitle);
  }

  return buildPriceLineChartUrl([100, 102, 98, 105, 103, 108, 110], pairLabel, p.sentiment ?? "neutral", engineTitle);
}

function buildInlineKeyboard(p: SignalPayload): Array<Array<{ text: string; url: string }>> {
  if (p.signalType === "digest") {
    return [];
  }
  return [];
}

function formatLockedCaption(p: SignalPayload): string {
  const pairStr = p.pair ?? "";
  let cap = `#${pairStr} (VIP Preview)\n\n`;
  cap += `Entry: Locked\n`;
  cap += `Stop Loss: Locked\n`;
  cap += `Target 1: Locked\n`;
  cap += `Target 2: Locked\n`;
  cap += `Target 3: Locked\n`;
  cap += `\nUnlock all targets & entry with VIP access.`;
  return cap;
}

function buildLockedKeyboard(vipUrl: string): Array<Array<{ text: string; url: string }>> {
  return [
    [{ text: "UNLOCK ALL TARGETS (BUY VIP)", url: vipUrl }],
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json() as SignalPayload;
    const { botId, signalId, engineSlug, signalType } = body;

    let bot = null;
    if (botId) {
      const { data } = await supabase.from("telegram_bots").select("*").eq("id", botId).maybeSingle();
      bot = data;
    }
    if (!bot) {
      const { data } = await supabase.from("telegram_bots").select("*").eq("is_active", true).eq("is_connected", true).order("created_at").limit(1).maybeSingle();
      bot = data;
    }
    if (!bot) {
      const { data: config } = await supabase.from("telegram_config").select("*").limit(1).maybeSingle();
      if (config?.bot_token && config?.chat_id) {
        bot = { bot_token: config.bot_token, chat_id: config.chat_id, id: null, name: "Legacy" };
      }
    }

    if (!bot || !bot.bot_token || !bot.chat_id) {
      if (signalId) await supabase.from("signals").update({ status: "failed" }).eq("id", signalId);
      return new Response(JSON.stringify({ error: "No active Telegram bot configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (engineSlug && bot.id) {
      const { data: route } = await supabase.from("bot_engine_routes").select("is_allowed").eq("bot_id", bot.id).eq("engine_slug", engineSlug).maybeSingle();
      if (route && !route.is_allowed) {
        if (signalId) await supabase.from("signals").update({ status: "failed" }).eq("id", signalId);
        return new Response(JSON.stringify({ error: "Engine not allowed for this bot" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    let caption: string;
    let keyboard: Array<Array<{ text: string; url: string }>>;
    const botRecord = bot as Record<string, unknown>;
    const isFreeChannel = botRecord.channel_type === "free" && signalType !== "digest";

    // 3:1 ratio for free channels — every 4th signal is locked
    let shouldLock = false;
    if (isFreeChannel) {
      const { data: vipData } = await supabase.from("vip_settings").select("free_signal_counter, id").limit(1).maybeSingle() as { data: Record<string, unknown> | null };
      const currentCounter = (vipData?.free_signal_counter as number) ?? 0;
      const newCounter = currentCounter + 1;
      if (newCounter % 4 === 0) {
        shouldLock = true;
      }
      if (vipData?.id) {
        await supabase.from("vip_settings").update({ free_signal_counter: newCounter % 4 }).eq("id", vipData.id as string);
      }

      // Resolve subscribe URL from the linked VIP bot
      let vipUrl = "";
      const linkedVipBotId = botRecord.linked_vip_bot_id as string | null;
      if (linkedVipBotId) {
        const { data: linkedBot } = await supabase.from("telegram_bots").select("sub_bot_username").eq("id", linkedVipBotId).maybeSingle() as { data: Record<string, unknown> | null };
        const subUrl = (linkedBot?.sub_bot_username as string) ?? "";
        if (subUrl) {
          if (subUrl.startsWith("http")) vipUrl = subUrl;
          else if (subUrl.startsWith("@")) vipUrl = `https://t.me/${subUrl.slice(1)}`;
          else if (subUrl.startsWith("t.me")) vipUrl = `https://${subUrl}`;
          else vipUrl = `https://t.me/${subUrl}`;
        }
      }
      if (!vipUrl) {
        // Fallback: try global vip_settings
        const { data: globalSettings } = await supabase.from("vip_settings").select("vip_subscribe_url").limit(1).maybeSingle() as { data: Record<string, unknown> | null };
        const globalUrl = (globalSettings?.vip_subscribe_url as string) ?? "";
        if (globalUrl) {
          if (globalUrl.startsWith("http")) vipUrl = globalUrl;
          else if (globalUrl.startsWith("@")) vipUrl = `https://t.me/${globalUrl.slice(1)}`;
          else if (globalUrl.startsWith("t.me")) vipUrl = `https://${globalUrl}`;
          else vipUrl = `https://t.me/${globalUrl}`;
        }
      }

      if (shouldLock) {
        caption = formatLockedCaption(body);
        keyboard = vipUrl ? buildLockedKeyboard(vipUrl) : [];
      } else {
        caption = formatSignalCaption(body);
        keyboard = buildInlineKeyboard(body);
      }
    } else if (signalType === "digest") {
      caption = formatDigestCaption(body);
      keyboard = buildInlineKeyboard(body);
    } else {
      caption = formatSignalCaption(body);
      keyboard = buildInlineKeyboard(body);
    }
    if (caption.length > 1024) caption = caption.slice(0, 1020) + "...";

    const chartUrl = await getChartImageUrl(body);

    const tgUrl = `https://api.telegram.org/bot${bot.bot_token}/sendPhoto`;
    const tgResp = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: bot.chat_id,
        photo: chartUrl,
        caption: caption,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const tgData = await tgResp.json();

    if (!tgResp.ok || !tgData.ok) {
      // Fallback to sendMessage
      const fallbackResp = await fetch(`https://api.telegram.org/bot${bot.bot_token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: bot.chat_id, text: caption, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard }, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000),
      });
      const fallbackData = await fallbackResp.json();

      if (!fallbackResp.ok || !fallbackData.ok) {
        if (signalId) await supabase.from("signals").update({ status: "failed", bot_id: bot.id ?? null }).eq("id", signalId);
        await supabase.from("system_logs").insert({ level: "error", engine_slug: engineSlug ?? null, message: `Telegram send failed (${bot.name ?? "bot"}): ${tgData.description ?? "Unknown"} | Fallback: ${fallbackData.description ?? "Unknown"}` });
        return new Response(JSON.stringify({ error: tgData.description ?? "Telegram API error" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (signalId) await supabase.from("signals").update({ status: "sent", bot_id: bot.id ?? null }).eq("id", signalId);
      await supabase.from("system_logs").insert({ level: "warning", engine_slug: engineSlug ?? null, message: `Telegram sent via fallback (text only) to "${bot.name ?? "bot"}" — sendPhoto failed: ${tgData.description ?? "Unknown"}` });
      return new Response(JSON.stringify({ success: true, messageId: fallbackData.result?.message_id, botName: bot.name, fallback: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (signalId) await supabase.from("signals").update({ status: "sent", bot_id: bot.id ?? null }).eq("id", signalId);
    await supabase.from("system_logs").insert({ level: "success", engine_slug: engineSlug ?? null, message: `Telegram photo alert sent via "${bot.name ?? "bot"}" to ${bot.chat_id}` });
    return new Response(JSON.stringify({ success: true, messageId: tgData.result?.message_id, botName: bot.name }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
