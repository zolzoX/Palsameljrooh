import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h"];
const MIN_VOLUME_USD = 10_000_000;
const MAX_PAIRS_TO_PROCESS = 40;
const DIGEST_THRESHOLD = 6;
const MAX_INDIVIDUAL_SIGNALS = 3;
const DEDUP_WINDOW_MINUTES = 15;
const FREE_DAILY_LIMIT = 60;
const VIP_DAILY_LIMIT = 25;
const MAJOR_COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "LTCUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT"];

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function computeStochastic(klines: Kline[], kPeriod = 14, dPeriod = 3): { k: number; d: number } {
  if (klines.length < kPeriod) return { k: 50, d: 50 };
  const highs = klines.slice(-kPeriod).map((k) => k.high);
  const lows = klines.slice(-kPeriod).map((k) => k.low);
  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);
  const currentClose = klines[klines.length - 1].close;
  const range = highestHigh - lowestLow;
  const k = range === 0 ? 50 : ((currentClose - lowestLow) / range) * 100;
  const kValues: number[] = [];
  for (let i = klines.length - kPeriod - dPeriod + 1; i <= klines.length; i++) {
    const sliceHighs = klines.slice(i - kPeriod, i).map((kk) => kk.high);
    const sliceLows = klines.slice(i - kPeriod, i).map((kk) => kk.low);
    const hh = Math.max(...sliceHighs);
    const ll = Math.min(...sliceLows);
    const cc = klines[i - 1].close;
    const r = hh - ll;
    kValues.push(r === 0 ? 50 : ((cc - ll) / r) * 100);
  }
  const d = kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  return { k, d };
}

function computeADX(klines: Kline[], period = 14): { adx: number; plusDI: number; minusDI: number } {
  if (klines.length < period * 2) return { adx: 0, plusDI: 0, minusDI: 0 };
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const upMove = klines[i].high - klines[i - 1].high;
    const downMove = klines[i - 1].low - klines[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const high = klines[i].high, low = klines[i].low, prevClose = klines[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const smoothTR = tr.slice(-period).reduce((a, b) => a + b, 0) / period;
  const smoothPlusDM = plusDM.slice(-period).reduce((a, b) => a + b, 0) / period;
  const smoothMinusDM = minusDM.slice(-period).reduce((a, b) => a + b, 0) / period;
  const plusDI = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
  const minusDI = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
  const dx = plusDI + minusDI === 0 ? 0 : Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  const adxValues: number[] = [];
  for (let i = 0; i < period && i < plusDM.length - period; i++) {
    const sTR = tr.slice(i, i + period).reduce((a, b) => a + b, 0) / period;
    const sPDM = plusDM.slice(i, i + period).reduce((a, b) => a + b, 0) / period;
    const sMDM = minusDM.slice(i, i + period).reduce((a, b) => a + b, 0) / period;
    const pDI = sTR === 0 ? 0 : (sPDM / sTR) * 100;
    const mDI = sTR === 0 ? 0 : (sMDM / sTR) * 100;
    adxValues.push(pDI + mDI === 0 ? 0 : Math.abs(pDI - mDI) / (pDI + mDI) * 100);
  }
  const adx = adxValues.length > 0 ? adxValues.reduce((a, b) => a + b, 0) / adxValues.length : dx;
  return { adx, plusDI, minusDI };
}

function computeVWAP(klines: Kline[], period = 20): number {
  if (klines.length < period) return klines[klines.length - 1]?.close ?? 0;
  const slice = klines.slice(-period);
  let totalVolume = 0, totalValue = 0;
  for (const k of slice) {
    const typicalPrice = (k.high + k.low + k.close) / 3;
    totalValue += typicalPrice * k.volume;
    totalVolume += k.volume;
  }
  return totalVolume === 0 ? slice[slice.length - 1].close : totalValue / totalVolume;
}

function computeEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function computeEMAArray(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) result.push(values[i] * k + result[i - 1] * (1 - k));
  return result;
}

function computeMACD(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod + signalPeriod) return { macdLine: 0, macdSignal: 0, macdHistogram: 0 };
  const fastEMA = computeEMAArray(closes, fastPeriod);
  const slowEMA = computeEMAArray(closes, slowPeriod);
  const macdValues: number[] = [];
  for (let i = 0; i < closes.length; i++) macdValues.push(fastEMA[i] - slowEMA[i]);
  const signalValues = computeEMAArray(macdValues.slice(-slowPeriod), signalPeriod);
  const macdLine = macdValues[macdValues.length - 1];
  const macdSignal = signalValues[signalValues.length - 1] ?? 0;
  return { macdLine, macdSignal, macdHistogram: macdLine - macdSignal };
}

function computeBollingerBands(closes: number[], period = 20, stdDev = 2) {
  if (closes.length < period) { const last = closes[closes.length - 1] ?? 0; return { upper: last, middle: last, lower: last }; }
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: middle + stdDev * sd, middle, lower: middle - stdDev * sd };
}

interface Kline { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; }

// Check existing signals for take-profit hits, mark them, and send Telegram notifications
async function checkTakeProfitHits(supabase: ReturnType<typeof createClient>, bots: Array<{ id: string; name: string; bot_token: string; chat_id: string }>, routes: Array<{ bot_id: string; engine_slug: string }>) {
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: activeSignals } = await supabase.from("signals")
      .select("id, pair, title, is_vip, tp1_price, tp2_price, tp3_price, tp1_hit, tp2_hit, tp3_hit, sentiment, entry_price, stop_loss_price")
      .eq("engine_slug", "scalping")
      .in("status", ["sent", "pending"])
      .gte("created_at", since)
      .or("tp1_hit.is.false,tp2_hit.is.false,tp3_hit.is.false");

    if (!activeSignals || activeSignals.length === 0) return;

    const scalpingBotIds = new Set(routes.filter((r) => r.engine_slug === "scalping").map((r) => r.bot_id));
    const scalpingBots = bots.filter((b) => scalpingBotIds.has(b.id));

    for (const sig of activeSignals as Array<Record<string, unknown>>) {
      const pair = sig.pair as string;
      if (!pair) continue;
      const symbol = pair.replace("/", "");
      const isBull = sig.sentiment === "bullish";

      try {
        const tickerResp = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`, { signal: AbortSignal.timeout(5000) });
        if (!tickerResp.ok) continue;
        const ticker = await tickerResp.json() as { price: string };
        const currentPrice = parseFloat(ticker.price);

        const updates: Record<string, boolean> = {};
        const hitTargets: string[] = [];
        const tp1 = sig.tp1_price as number | null;
        const tp2 = sig.tp2_price as number | null;
        const tp3 = sig.tp3_price as number | null;

        if (tp1 && !sig.tp1_hit) {
          if (isBull ? currentPrice >= tp1 : currentPrice <= tp1) { updates.tp1_hit = true; hitTargets.push("TP1"); }
        }
        if (tp2 && !sig.tp2_hit) {
          if (isBull ? currentPrice >= tp2 : currentPrice <= tp2) { updates.tp2_hit = true; hitTargets.push("TP2"); }
        }
        if (tp3 && !sig.tp3_hit) {
          if (isBull ? currentPrice >= tp3 : currentPrice <= tp3) { updates.tp3_hit = true; hitTargets.push("TP3"); }
        }

        if (hitTargets.length > 0) {
          await supabase.from("signals").update(updates).eq("id", sig.id as string);

          const pairStr = sig.pair as string;
          const sigTitle = sig.title as string;
          const isVip = sig.is_vip as boolean;
          const entryPrice = sig.entry_price as number | null;
          const slPrice = sig.stop_loss_price as number | null;
          const tp1Hit = updates.tp1_hit || sig.tp1_hit;
          const tp2Hit = updates.tp2_hit || sig.tp2_hit;
          const tp3Hit = updates.tp3_hit || sig.tp3_hit;

          for (const bot of scalpingBots) {
            const botRecord = bot as Record<string, unknown>;
            const isFreeChannel = botRecord.channel_type === "free";

            let msg = `\u2705 <b>TAKE PROFIT HIT</b>\n\n`;
            msg += `#${pairStr}\n`;
            msg += `${sigTitle}\n\n`;

            if (isFreeChannel && isVip) {
              msg += `Current Price: ${currentPrice < 1 ? currentPrice.toPrecision(4) : currentPrice.toFixed(2)}\n\n`;
              for (const tp of hitTargets) {
                msg += `${tp}: \u2705 HIT\n`;
              }
              msg += `\nUnlock full targets with VIP access.`;
            } else {
              msg += `Current Price: ${currentPrice < 1 ? currentPrice.toPrecision(4) : currentPrice.toFixed(2)}\n\n`;
              if (entryPrice != null) msg += `Entry: ${entryPrice < 1 ? entryPrice.toPrecision(4) : entryPrice.toFixed(2)}\n`;
              if (tp1 != null) msg += `TP1: ${tp1 < 1 ? tp1.toPrecision(4) : tp1.toFixed(2)} ${tp1Hit ? "\u2705 HIT" : ""}\n`;
              if (tp2 != null) msg += `TP2: ${tp2 < 1 ? tp2.toPrecision(4) : tp2.toFixed(2)} ${tp2Hit ? "\u2705 HIT" : ""}\n`;
              if (tp3 != null) msg += `TP3: ${tp3 < 1 ? tp3.toPrecision(4) : tp3.toFixed(2)} ${tp3Hit ? "\u2705 HIT" : ""}\n`;
              if (slPrice != null) msg += `SL: ${slPrice < 1 ? slPrice.toPrecision(4) : slPrice.toFixed(2)}\n`;
            }

            try {
              await fetch(`https://api.telegram.org/bot${bot.bot_token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: bot.chat_id,
                  text: msg,
                  parse_mode: "HTML",
                  disable_web_page_preview: true,
                }),
                signal: AbortSignal.timeout(10000),
              });
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let timeframe = "1h";
    try {
      const body = await req.json();
      if (body?.timeframe && VALID_TIMEFRAMES.includes(body.timeframe)) timeframe = body.timeframe;
    } catch { /* default */ }

    const log: string[] = [];

    // 1. Fetch all signal configs
    const { data: configs } = await supabase.from("signal_config").select("*");
    const cfgMap: Record<string, Record<string, number>> = {};
    for (const c of configs ?? []) cfgMap[c.timeframe] = c;
    const cfg = cfgMap[timeframe] ?? { rsi_oversold: 30, rsi_overbought: 70, ema_fast_period: 12, ema_slow_period: 26, macd_fast: 12, macd_slow: 26, macd_signal: 9, bb_period: 20, bb_std_dev: 2 };

    // 2. Fetch all active bots and their engine routes
    const { data: botData } = await supabase.from("telegram_bots").select("*").eq("is_active", true).eq("is_connected", true);
    const { data: routeData } = await supabase.from("bot_engine_routes").select("*").eq("is_allowed", true);
    const bots = (botData ?? []) as Array<{ id: string; name: string; bot_token: string; chat_id: string; channel_type: string }>
    const routes = (routeData ?? []) as Array<{ bot_id: string; engine_slug: string }>;

    if (bots.length === 0) {
      return new Response(JSON.stringify({ error: "No active Telegram bots configured", signalsGenerated: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    log.push(`${bots.length} active bots, ${routes.length} routes`);

    // 2b. Fetch referral links for embedding in Telegram messages
    const { data: referralData } = await supabase.from("referral_links").select("*").eq("is_active", true);
    const referralLinks = (referralData ?? []) as Array<{ exchange_name: string; referral_url: string }>;
    const getReferralUrl = (exchangeName: string, fallback: string): string => {
      const match = referralLinks.find((rl) => exchangeName.toLowerCase().includes(rl.exchange_name.toLowerCase()) || rl.exchange_name.toLowerCase().includes(exchangeName.toLowerCase()));
      return match?.referral_url ?? fallback;
    };
    log.push(`${referralLinks.length} referral links loaded`);

    // 3. Scan Binance for all USDT pairs with >$10M volume — top 100 by volume
    const tickerResp = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", { signal: AbortSignal.timeout(10000) });
    if (!tickerResp.ok) throw new Error("Binance ticker API failed");
    const allTickers = await tickerResp.json() as Array<Record<string, string>>;

    const eligible = allTickers
      .filter((t) => {
        const sym = t.symbol ?? "";
        if (!sym.endsWith("USDT")) return false;
        if (sym.includes("UPUSDT") || sym.includes("DOWNUSDT") || sym.includes("BULLUSDT") || sym.includes("BEARUSDT")) return false;
        const stablecoins = ["USDCUSDT", "BUSDUSDT", "TUSDUSDT", "FDUSDUSDT", "DAIUSDT", "EURUSDT", "GBPUSDT", "USD1USDT"];
        if (stablecoins.includes(sym)) return false;
        return parseFloat(t.quoteVolume ?? "0") >= MIN_VOLUME_USD;
      })
      .map((t) => ({ symbol: t.symbol, baseAsset: t.symbol.replace("USDT", ""), price: parseFloat(t.lastPrice), priceChange: parseFloat(t.priceChangePercent), volume: parseFloat(t.quoteVolume) }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, MAX_PAIRS_TO_PROCESS);

    // Always include major coins
    for (const sym of MAJOR_COINS) {
      if (!eligible.some((p) => p.symbol === sym)) {
        const t = allTickers.find((tt) => tt.symbol === sym);
        if (t) eligible.push({ symbol: sym, baseAsset: sym.replace("USDT", ""), price: parseFloat(t.lastPrice), priceChange: parseFloat(t.priceChangePercent), volume: parseFloat(t.quoteVolume) });
      }
    }
    log.push(`Scanning ${eligible.length} pairs on ${timeframe}`);

    // 4. Fetch recent signals for dedup (last 15 min)
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data: recentSignals } = await supabase.from("signals").select("title, engine_slug, timeframe").gte("created_at", dedupSince);
    const recentTitles = new Set((recentSignals ?? []).map((s: { title: string }) => s.title));

    // 4b. Count today's signals for daily limits
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: freeCountToday } = await supabase.from("signals").select("*", { count: "exact", head: true }).eq("engine_slug", "scalping").eq("is_vip", false).not("entry_price", "is", null).gte("created_at", todayStart.toISOString());
    const { count: vipCountToday } = await supabase.from("signals").select("*", { count: "exact", head: true }).eq("engine_slug", "scalping").eq("is_vip", true).not("entry_price", "is", null).gte("created_at", todayStart.toISOString());
    const freeRemaining = FREE_DAILY_LIMIT - (freeCountToday ?? 0);
    const vipRemaining = VIP_DAILY_LIMIT - (vipCountToday ?? 0);
    log.push(`Daily limits: free ${freeCountToday}/${FREE_DAILY_LIMIT} (${freeRemaining} remaining), VIP ${vipCountToday}/${VIP_DAILY_LIMIT} (${vipRemaining} remaining)`);

    // 4c. Check TP hits on existing active signals
    await checkTakeProfitHits(supabase, bots, routes);

    // Determine trade type: futures-eligible pairs on Binance (hardcoded list since futures API is geo-blocked)
    const futuresPairs = new Set<string>([
      "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
      "DOTUSDT", "LINKUSDT", "MATICUSDT", "LTCUSDT", "BCHUSDT", "ATOMUSDT", "UNIUSDT", "NEARUSDT",
      "APTUSDT", "FILUSDT", "ARBUSDT", "OPUSDT", "INJUSDT", "SUIUSDT", "SEIUSDT", "TIAUSDT",
      "RUNEUSDT", "AAVEUSDT", "SANDUSDT", "MANAUSDT", "AXSUSDT", "FTMUSDT", "GALAUSDT", "EOSUSDT",
      "XLMUSDT", "ICPUSDT", "SHIBUSDT", "PEPEUSDT", "WIFUSDT", "FLOKIUSDT", "BONKUSDT", "JUPUSDT",
      "PYTHUSDT", "ORDIUSDT", "1000SATSUSDT", "1000PEPEUSDT", "ENAUSDT", "WLDUSDT", "STXUSDT",
      "GMTUSDT", "BLURUSDT", "LDOUSDT", "CRVUSDT", "COMPUSDT", "SNXUSDT", "MKRUSDT", "DYDXUSDT",
      "PEPEUSDT", "BOMEUSDT", "JTOUSDT", "TONUSDT", "NOTUSDT", "ZKUSDT", "ZROUSDT", "ETHFIUSDT",
      "EIGENUSDT", "TIAUSDT", "SEIUSDT", "SAGAUSDT", "OMNIUSDT", "TNSRUSDT", "REZUSDT", "LISTAUSDT",
      "ZKUSDT", "BANANAUSDT", "WUSDT", "IOUSDT", "IOUSDT", "IOUSDT", "IOUSDT", "IOUSDT",
    ]);

    // 5. Analyze each pair and generate signals
    const newSignals: Array<{
      engine_slug: string; title: string; message: string; status: string;
      source_url: string; pair: string | null; sentiment: string | null;
      timeframe: string; indicators: string[]; signalType: string;
      price: number; priceChange: number; confidence: number;
      is_vip: boolean; entitlement: 'free' | 'vip'; entry_price: number | null; tp1_price: number | null;
      tp2_price: number | null; tp3_price: number | null; stop_loss_price: number | null;
    }> = [];

    function computeTradeLevels(price: number, sentiment: string, rsi: number, bb: { upper: number; middle: number; lower: number }, atr: number) {
      const isBull = sentiment === "bullish";
      const entry = price;
      const slDist = Math.max(atr * 1.5, price * 0.02);
      const stopLoss = isBull ? entry - slDist : entry + slDist;
      const tp1Dist = Math.max(atr * 2, price * 0.015);
      const tp2Dist = Math.max(atr * 3.5, price * 0.03);
      const tp3Dist = Math.max(atr * 5, price * 0.05);
      const tp1 = isBull ? entry + tp1Dist : entry - tp1Dist;
      const tp2 = isBull ? entry + tp2Dist : entry - tp2Dist;
      const tp3 = isBull ? entry + tp3Dist : entry - tp3Dist;
      return { entry, stopLoss, tp1, tp2, tp3 };
    }

    function fmtPrice(p: number): string {
      if (p < 0.001) return p.toPrecision(4);
      if (p < 1) return p.toFixed(6);
      if (p < 100) return p.toFixed(4);
      return p.toFixed(2);
    }

    function computeLeverage(atr: number, price: number, rsi: number, confidence: number): number {
      if (price <= 0 || atr <= 0) return 3;
      const volatilityPct = (atr / price) * 100;
      let leverage = 15;
      if (volatilityPct > 5) leverage = 3;
      else if (volatilityPct > 3) leverage = 5;
      else if (volatilityPct > 2) leverage = 7;
      else if (volatilityPct > 1.5) leverage = 10;
      else leverage = 12;
      // Reduce leverage when RSI signals overbought/oversold extremes
      if (rsi >= 70 || rsi <= 30) leverage = Math.max(3, leverage - 2);
      if (confidence < 60) leverage = Math.max(3, Math.round(leverage * 0.7));
      // Hard cap at x15
      return Math.min(15, Math.max(3, leverage));
    }

    function buildSignalMessage(pair: { baseAsset: string; symbol: string }, tradeType: string, sentiment: string, rsi: number, macdBullish: boolean, bb: { upper: number; middle: number; lower: number }, price: number, change: number, confidence: number, levels: { entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number }, timeframe: string, atr: number): string {
      const isBull = sentiment === "bullish";
      const dirEmoji = isBull ? "\u{1F7E2}" : "\u{1F534}";
      const dirLabel = isBull ? "Long" : "Short";
      const pairStr = `${pair.baseAsset}/USDT`;

      let msg = `<b>FREE SIGNAL</b>\n`;
      msg += `#${pairStr} - ${dirLabel} ${dirEmoji}\n`;
      msg += `Type: ${tradeType === "FUTURES" ? "FUTURES" : "SPOT"}\n\n`;
      msg += `Entry: ${fmtPrice(levels.entry)}\n`;
      msg += `Stop Loss: ${fmtPrice(levels.stopLoss)}\n`;
      msg += `Target 1: ${fmtPrice(levels.tp1)}\n`;
      msg += `Target 2: ${fmtPrice(levels.tp2)}\n`;
      msg += `Target 3: ${fmtPrice(levels.tp3)}\n`;
      if (tradeType === "FUTURES") {
        const lev = computeLeverage(atr, price, rsi, confidence);
        msg += `Leverage: x${lev}\n`;
      }
      msg += `\n24h: ${change >= 0 ? "+" : ""}${change.toFixed(2)}% | TF: ${timeframe}`;
      return msg;
    }

    function buildVipSignalMessage(pair: { baseAsset: string; symbol: string }, tradeType: string, sentiment: string, rsi: number, macdBullish: boolean, bb: { upper: number; middle: number; lower: number }, price: number, change: number, confidence: number, levels: { entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number }, timeframe: string, atr: number, vipInd: { emaFast: number; emaSlow: number; macd: { macd: number; signal: number; macdHistogram: number }; stoch: { k: number; d: number }; adx: { adx: number; plusDI: number; minusDI: number }; vwap: number; triggered: string[] }): string {
      const isBull = sentiment === "bullish";
      const dirEmoji = isBull ? "\u{1F7E2}" : "\u{1F534}";
      const dirLabel = isBull ? "Long" : "Short";
      const pairStr = `${pair.baseAsset}/USDT`;
      const agreeCount = vipInd.triggered.length;
      const mark = (name: string) => vipInd.triggered.includes(name) ? " \u{2705}" : " \u{274C}";

      let msg = `<b>VIP SIGNAL</b>\n`;
      msg += `#${pairStr} - ${dirLabel} ${dirEmoji}\n`;
      msg += `Type: ${tradeType === "FUTURES" ? "FUTURES" : "SPOT"}\n`;
      msg += `Agreement: ${agreeCount}/5 indicators\n\n`;

      msg += `<b>Trade Levels</b>\n`;
      msg += `Entry: ${fmtPrice(levels.entry)}\n`;
      msg += `Stop Loss: ${fmtPrice(levels.stopLoss)}\n`;
      msg += `Target 1: ${fmtPrice(levels.tp1)}\n`;
      msg += `Target 2: ${fmtPrice(levels.tp2)}\n`;
      msg += `Target 3: ${fmtPrice(levels.tp3)}\n`;
      if (tradeType === "FUTURES") {
        const lev = computeLeverage(atr, price, rsi, confidence);
        msg += `Leverage: x${lev}\n`;
      }

      msg += `\n<b>Technical Indicators (5)</b>\n`;
      msg += `RSI: ${rsi.toFixed(1)}${mark("RSI")}\n`;
      msg += `EMA: Fast ${fmtPrice(vipInd.emaFast)} / Slow ${fmtPrice(vipInd.emaSlow)}${mark("EMA")}\n`;
      msg += `MACD: Hist ${vipInd.macd.macdHistogram >= 0 ? "+" : ""}${vipInd.macd.macdHistogram.toFixed(4)}${mark("MACD")}\n`;
      msg += `BB: L ${fmtPrice(bb.lower)} / M ${fmtPrice(bb.middle)} / U ${fmtPrice(bb.upper)}${mark("BB")}\n`;
      msg += `ADX: ${vipInd.adx.adx.toFixed(1)} (+DI ${vipInd.adx.plusDI.toFixed(1)} / -DI ${vipInd.adx.minusDI.toFixed(1)})${mark("ADX")}\n`;

      msg += `\n24h: ${change >= 0 ? "+" : ""}${change.toFixed(2)}% | TF: ${timeframe}`;
      return msg;
    }

    // Build a locked/teaser caption for VIP signals shown on FREE channel
    function buildLockedCaption(sig: { engine_slug: string; title: string; pair: string | null; sentiment: string | null }): string {
      const pairStr = sig.pair ?? "";
      const isBull = sig.sentiment === "bullish";
      const dirEmoji = isBull ? "\u{1F7E2}" : sig.sentiment === "bearish" ? "\u{1F534}" : "\u{26AA}";
      const dirLabel = isBull ? "Long" : sig.sentiment === "bearish" ? "Short" : "Neutral";
      let msg = `\u{1F512} <b>VIP SIGNAL — LOCKED</b>\n`;
      msg += `#${pairStr} - ${dirLabel} ${dirEmoji}\n\n`;
      msg += `This premium signal is available to VIP members only.\n`;
      msg += `Upgrade to VIP to unlock:\n`;
      msg += `\u{2022} Entry, Stop Loss & 3 Take Profit targets\n`;
      msg += `\u{2022} 5 technical indicators (RSI, EMA, MACD, BB, ADX)\n`;
      msg += `\u{2022} Optimal leverage recommendations\n\n`;
      msg += `Tap the button below to unlock this signal \u{2B07}\u{FE0F}`;
      return msg;
    }

    let freeSignalsGenerated = 0;
    let vipSignalsGenerated = 0;

    // Fetch klines in parallel batches of 10 to avoid timeout
    const batchSize = 10;
    for (let batchStart = 0; batchStart < eligible.length; batchStart += batchSize) {
      if (freeRemaining <= 0 && vipRemaining <= 0) break;
      const batch = eligible.slice(batchStart, batchStart + batchSize);
      const klineResults = await Promise.allSettled(
        batch.map(async (pair) => {
          const klineResp = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${pair.symbol}&interval=${timeframe}&limit=200`, { signal: AbortSignal.timeout(8000) });
          if (!klineResp.ok) return null;
          const rawKlines = await klineResp.json() as Array<Array<string | number>>;
          const klines: Kline[] = rawKlines.map((k) => ({ openTime: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]), closeTime: Number(k[6]) }));
          return { pair, klines };
        })
      );

      for (const result of klineResults) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const { pair, klines } = result.value;
        const closes = klines.map((k) => k.close);
        if (closes.length < 30) continue;

        // Compute all 7 indicators
        const rsi = computeRSI(closes, 14);
        const emaFast = computeEMA(closes.slice(-30), cfg.ema_fast_period ?? 12);
        const emaSlow = computeEMA(closes.slice(-30), cfg.ema_slow_period ?? 26);
        const macd = computeMACD(closes, cfg.macd_fast ?? 12, cfg.macd_slow ?? 26, cfg.macd_signal ?? 9);
        const bb = computeBollingerBands(closes, cfg.bb_period ?? 20, cfg.bb_std_dev ?? 2);
        const stoch = computeStochastic(klines, cfg.stoch_k_period ?? 14, cfg.stoch_d_period ?? 3);
        const adx = computeADX(klines, cfg.adx_period ?? 14);
        const vwap = computeVWAP(klines, cfg.vwap_period ?? 20);
        const isBullishEma = emaFast > emaSlow;
        const macdBullish = macd.macdHistogram > 0;
        const price = pair.price;
        const change = pair.priceChange;

        // Compute ATR for stop loss / take profit
        const atrPeriod = 14;
        let atr = 0;
        if (klines.length >= atrPeriod + 1) {
          const trueRanges: number[] = [];
          for (let i = klines.length - atrPeriod; i < klines.length; i++) {
            const high = klines[i].high, low = klines[i].low, prevClose = klines[i - 1].close;
            trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
          }
          atr = trueRanges.reduce((a, b) => a + b, 0) / atrPeriod;
        }

        // --- FREE signal: 4 basic indicators (RSI, EMA, MACD, BB), 2+ must agree ---
        if (freeRemaining - freeSignalsGenerated > 0) {
          const triggered: string[] = [];
          let sentiment = "neutral";
          let strength = 0;

          if (rsi <= (cfg.rsi_oversold ?? 30)) { triggered.push("RSI"); sentiment = "bullish"; strength += 2; }
          else if (rsi >= (cfg.rsi_overbought ?? 70)) { triggered.push("RSI"); sentiment = "bearish"; strength += 2; }

          if (isBullishEma) { triggered.push("EMA"); if (sentiment !== "bearish") sentiment = "bullish"; strength += 1; }
          else { triggered.push("EMA"); if (sentiment !== "bullish") sentiment = "bearish"; strength += 1; }

          if (macdBullish) { triggered.push("MACD"); if (sentiment !== "bearish") sentiment = "bullish"; strength += 1; }
          else { triggered.push("MACD"); if (sentiment !== "bullish") sentiment = "bearish"; strength += 1; }

          if (price <= bb.lower) { triggered.push("BB"); if (sentiment !== "bearish") sentiment = "bullish"; strength += 1; }
          else if (price >= bb.upper) { triggered.push("BB"); if (sentiment !== "bullish") sentiment = "bearish"; strength += 1; }

          if (strength >= 2 && sentiment !== "neutral") {
            const confidence = Math.min(100, Math.round((strength / 5) * 100));
            const tradeType = futuresPairs.has(pair.symbol) ? "FUTURES" : "SPOT";
            const levels = computeTradeLevels(price, sentiment, rsi, bb, atr);
            const dirLabel = sentiment === "bullish" ? "LONG" : "SHORT";
            let title = "";
            if (strength >= 4 && sentiment === "bullish") {
              title = `[${tradeType}] ${pair.baseAsset} STRONG LONG — ${confidence}% (${timeframe})`;
            } else if (strength >= 4 && sentiment === "bearish") {
              title = `[${tradeType}] ${pair.baseAsset} STRONG SHORT — ${confidence}% (${timeframe})`;
            } else if (rsi <= (cfg.rsi_oversold ?? 30)) {
              title = `[${tradeType}] ${pair.baseAsset} OVERSOLD LONG — RSI ${rsi.toFixed(1)} (${timeframe})`;
            } else if (rsi >= (cfg.rsi_overbought ?? 70)) {
              title = `[${tradeType}] ${pair.baseAsset} OVERBOUGHT SHORT — RSI ${rsi.toFixed(1)} (${timeframe})`;
            } else if (sentiment === "bullish") {
              title = `[${tradeType}] ${pair.baseAsset} LONG — ${confidence}% (${timeframe})`;
            } else if (sentiment === "bearish") {
              title = `[${tradeType}] ${pair.baseAsset} SHORT — ${confidence}% (${timeframe})`;
            } else continue;

            if (recentTitles.has(title)) continue;
            const message = buildSignalMessage(pair, tradeType, sentiment, rsi, macdBullish, bb, price, change, confidence, levels, timeframe, atr);
            newSignals.push({
              engine_slug: "scalping", title, message, status: "pending",
              source_url: `https://www.binance.com/en/trade/${pair.symbol}`,
              pair: `${pair.baseAsset}/USDT`, sentiment, timeframe,
              indicators: triggered, signalType: "signal", price, priceChange: change, confidence,
              is_vip: false, entitlement: 'free', entry_price: levels.entry, tp1_price: levels.tp1,
              tp2_price: levels.tp2, tp3_price: levels.tp3, stop_loss_price: levels.stopLoss,
            });
            freeSignalsGenerated++;
          }
        }

        // --- VIP signal: 3+ of 5 quality indicators must agree (configurable via scalper_vip_threshold) ---
        // VIP uses 5 stronger indicators: RSI, EMA, MACD, BB, ADX (fewer but better than FREE's 4)
        if (vipRemaining - vipSignalsGenerated > 0) {
          const triggered: string[] = [];
          let sentiment = "neutral";
          let agreeCount = 0;

          // RSI
          if (rsi <= (cfg.rsi_oversold ?? 30)) { triggered.push("RSI"); sentiment = "bullish"; agreeCount++; }
          else if (rsi >= (cfg.rsi_overbought ?? 70)) { triggered.push("RSI"); sentiment = "bearish"; agreeCount++; }

          // EMA
          if (isBullishEma) { triggered.push("EMA"); if (sentiment === "neutral") sentiment = "bullish"; else if (sentiment === "bullish") agreeCount++; }
          else { triggered.push("EMA"); if (sentiment === "neutral") sentiment = "bearish"; else if (sentiment === "bearish") agreeCount++; }

          // MACD
          if (macdBullish) { triggered.push("MACD"); if (sentiment === "bullish") agreeCount++; }
          else { triggered.push("MACD"); if (sentiment === "bearish") agreeCount++; }

          // Bollinger Bands
          if (price <= bb.lower) { triggered.push("BB"); if (sentiment === "bullish") agreeCount++; }
          else if (price >= bb.upper) { triggered.push("BB"); if (sentiment === "bearish") agreeCount++; }

          // ADX (trend strength — quality filter, not in FREE)
          const adxThreshold = (cfg.adx_threshold ?? 25);
          if (adx.adx >= adxThreshold) {
            triggered.push("ADX");
            const adxBull = adx.plusDI > adx.minusDI;
            if (adxBull && sentiment === "bullish") agreeCount++;
            else if (!adxBull && sentiment === "bearish") agreeCount++;
          }

          // VIP requires scalper_vip_threshold+ of 5 indicators agreeing in the same direction
          const vipThreshold = cfg.scaler_vip_threshold ?? 3;
          if (agreeCount >= vipThreshold && sentiment !== "neutral") {
            const confidence = Math.min(100, Math.round((agreeCount / 5) * 100));
            const tradeType = futuresPairs.has(pair.symbol) ? "FUTURES" : "SPOT";
            const levels = computeTradeLevels(price, sentiment, rsi, bb, atr);
            const dirLabel = sentiment === "bullish" ? "LONG" : "SHORT";
            const title = `[VIP] [${tradeType}] ${pair.baseAsset} ${dirLabel} — ${confidence}% (${timeframe})`;
            if (recentTitles.has(title)) continue;
            const message = buildVipSignalMessage(pair, tradeType, sentiment, rsi, macdBullish, bb, price, change, confidence, levels, timeframe, atr, { emaFast, emaSlow, macd, stoch, adx, vwap, triggered });
            newSignals.push({
              engine_slug: "scalping", title, message, status: "pending",
              source_url: `https://www.binance.com/en/trade/${pair.symbol}`,
              pair: `${pair.baseAsset}/USDT`, sentiment, timeframe,
              indicators: triggered, signalType: "signal", price, priceChange: change, confidence,
              is_vip: true, entitlement: 'vip', entry_price: levels.entry, tp1_price: levels.tp1,
              tp2_price: levels.tp2, tp3_price: levels.tp3, stop_loss_price: levels.stopLoss,
            });
            vipSignalsGenerated++;
          }
        }
      }
    }

    // 6. Also run whale tracker — >= 10 BTC equivalent aggregated, >= 1 BTC equiv single
    // Uses 50 major cryptocurrencies with 1-minute bucketing
    const whalePairs = [
      { asset: "BTC", binance: "BTCUSDT" },
      { asset: "ETH", binance: "ETHUSDT" },
      { asset: "BNB", binance: "BNBUSDT" },
      { asset: "SOL", binance: "SOLUSDT" },
      { asset: "XRP", binance: "XRPUSDT" },
      { asset: "ADA", binance: "ADAUSDT" },
      { asset: "DOGE", binance: "DOGEUSDT" },
      { asset: "AVAX", binance: "AVAXUSDT" },
      { asset: "DOT", binance: "DOTUSDT" },
      { asset: "TRX", binance: "TRXUSDT" },
      { asset: "LINK", binance: "LINKUSDT" },
      { asset: "MATIC", binance: "MATICUSDT" },
      { asset: "LTC", binance: "LTCUSDT" },
      { asset: "BCH", binance: "BCHUSDT" },
      { asset: "ATOM", binance: "ATOMUSDT" },
      { asset: "UNI", binance: "UNIUSDT" },
      { asset: "NEAR", binance: "NEARUSDT" },
      { asset: "APT", binance: "APTUSDT" },
      { asset: "FIL", binance: "FILUSDT" },
      { asset: "ARB", binance: "ARBUSDT" },
      { asset: "OP", binance: "OPUSDT" },
      { asset: "INJ", binance: "INJUSDT" },
      { asset: "SUI", binance: "SUIUSDT" },
      { asset: "SEI", binance: "SEIUSDT" },
      { asset: "TIA", binance: "TIAUSDT" },
      { asset: "RUNE", binance: "RUNEUSDT" },
      { asset: "AAVE", binance: "AAVEUSDT" },
      { asset: "FTM", binance: "FTMUSDT" },
      { asset: "SAND", binance: "SANDUSDT" },
      { asset: "MANA", binance: "MANAUSDT" },
      { asset: "AXS", binance: "AXSUSDT" },
      { asset: "GALA", binance: "GALAUSDT" },
      { asset: "EOS", binance: "EOSUSDT" },
      { asset: "XLM", binance: "XLMUSDT" },
      { asset: "ICP", binance: "ICPUSDT" },
      { asset: "SHIB", binance: "SHIBUSDT" },
      { asset: "PEPE", binance: "PEPEUSDT" },
      { asset: "WIF", binance: "WIFUSDT" },
      { asset: "FLOKI", binance: "FLOKIUSDT" },
      { asset: "BONK", binance: "BONKUSDT" },
      { asset: "JUP", binance: "JUPUSDT" },
      { asset: "PYTH", binance: "PYTHUSDT" },
      { asset: "ORDI", binance: "ORDIUSDT" },
      { asset: "ENA", binance: "ENAUSDT" },
      { asset: "WLD", binance: "WLDUSDT" },
      { asset: "STX", binance: "STXUSDT" },
      { asset: "TON", binance: "TONUSDT" },
      { asset: "NOT", binance: "NOTUSDT" },
      { asset: "DYDX", binance: "DYDXUSDT" },
    ];
    let whaleBtcPrice = 0;
    let whaleBtcAvailable = false;
    try {
      const wBtcResp = await fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT", { signal: AbortSignal.timeout(5000) });
      if (wBtcResp.ok) { const wBtcData = await wBtcResp.json() as { price: string }; whaleBtcPrice = parseFloat(wBtcData.price); whaleBtcAvailable = whaleBtcPrice > 0; }
    } catch (err) {
      await supabase.from("system_logs").insert({ level: "error", engine_slug: "whale", message: `BTC price fetch failed for whale thresholds: ${err instanceof Error ? err.message : "unknown"}` });
    }
    if (!whaleBtcAvailable) {
      await supabase.from("system_logs").insert({ level: "warning", engine_slug: "whale", message: "BTC price unavailable — skipping whale detection this cycle (stale price would create incorrect thresholds)" });
      log.push("Whale detection skipped: BTC price unavailable");
    }
    const whaleAggThreshold = 10 * whaleBtcPrice;
    const whaleSingleThreshold = 1 * whaleBtcPrice;

    // Process whale pairs in parallel batches of 10 (skip if BTC price unavailable)
    if (whaleBtcAvailable) {
    for (let wBatchStart = 0; wBatchStart < whalePairs.length; wBatchStart += 10) {
      const wBatch = whalePairs.slice(wBatchStart, wBatchStart + 10);
      const wResults = await Promise.allSettled(wBatch.map(async (wp) => {
        const wPairSignals: typeof newSignals = [];
        try {
          const aggResp = await fetch(`https://data-api.binance.vision/api/v3/aggTrades?symbol=${wp.binance}&limit=2000`, { signal: AbortSignal.timeout(8000) });
          if (!aggResp.ok) return wPairSignals;
          const aggTrades = await aggResp.json() as Array<{ a: number; p: string; q: string; T: number; m: boolean }>;
          if (aggTrades.length === 0) return wPairSignals;

          // Group by 1-minute windows
          const buckets = new Map<number, { totalQty: number; totalUsd: number; buys: number; sells: number }>();
          for (const t of aggTrades) {
            const qty = parseFloat(t.q);
            const tPrice = parseFloat(t.p);
            const usdVal = qty * tPrice;
            const minuteKey = Math.floor(t.T / 60000);
            const b = buckets.get(minuteKey) ?? { totalQty: 0, totalUsd: 0, buys: 0, sells: 0 };
            b.totalQty += qty;
            b.totalUsd += usdVal;
            if (t.m) { b.sells += qty; } else { b.buys += qty; }
            buckets.set(minuteKey, b);
          }

          for (const [minuteKey, b] of buckets) {
            if (b.totalUsd < whaleAggThreshold) continue;
            const tradeKey = `binance_${wp.asset}_min_${minuteKey}`;
            const { data: existing } = await supabase.from("whale_alerts").select("id").eq("from_addr", tradeKey).limit(1).maybeSingle();
            if (existing) continue;
            const direction = b.buys > b.sells ? "in" : "out";
            await supabase.from("whale_alerts").insert({ asset: wp.asset, amount: b.totalQty, usd_value: b.totalUsd, direction, from_addr: tradeKey, to_addr: `agg_${minuteKey}` });
            const usdStr = b.totalUsd >= 1e6 ? "$" + (b.totalUsd / 1e6).toFixed(1) + "M" : "$" + (b.totalUsd / 1e3).toFixed(0) + "K";
            const wTitle = `Whale ${direction === "out" ? "SELL" : "BUY"} — ${wp.asset} ${usdStr}`;
            if (!recentTitles.has(wTitle)) {
              wPairSignals.push({
                engine_slug: "whale", title: wTitle,
                message: `Large ${direction === "out" ? "sell" : "buy"} of ${b.totalQty.toFixed(4)} ${wp.asset} worth ${usdStr} on Binance (1-min aggregated).`,
                status: "pending", source_url: "https://www.binance.com", pair: wp.asset,
                sentiment: direction === "out" ? "bearish" : "bullish", timeframe: "1h",
                indicators: ["WHALE"], signalType: "whale", price: 0, priceChange: 0, confidence: 85,
                is_vip: false, entitlement: "free",
              });
            }
          }

          // Also detect single large trades (>= 1 BTC equiv)
          for (const trade of aggTrades) {
            const qty = parseFloat(trade.q);
            const tPrice = parseFloat(trade.p);
            const usdVal = qty * tPrice;
            if (usdVal < whaleSingleThreshold) continue;
            const singleKey = `binance_${wp.asset}_single_${trade.a}`;
            const { data: existingSingle } = await supabase.from("whale_alerts").select("id").eq("from_addr", singleKey).limit(1).maybeSingle();
            if (existingSingle) continue;
            await supabase.from("whale_alerts").insert({ asset: wp.asset, amount: qty, usd_value: usdVal, direction: trade.m ? "out" : "in", from_addr: singleKey, to_addr: `single_${trade.a}` });
          }
        } catch { /* skip whale pair */ }
        return wPairSignals;
      }));
      for (const wr of wResults) {
        if (wr.status === "fulfilled") newSignals.push(...wr.value);
      }
    }
    } // end if (whaleBtcAvailable)

    // 7. Run meme radar and generate meme signals with counter-based entitlement
    // Rule: signals 1-3 = free, 4+ = vip (persistent, atomic, race-safe)
    try {
      const memeResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meme-radar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`, "Content-Type": "application/json" },
      });
      if (memeResp.ok) {
        const memeData = await memeResp.json();
        for (const token of (memeData.tokens ?? []) as Array<Record<string, unknown>>) {
          const momentum = token.momentum as string ?? "neutral";
          if (momentum === "strong-bullish" || momentum === "strong-bearish" || momentum === "surging" || momentum === "dumping") {
            const symbol = token.symbol as string;
            const mTitle = `Meme ${momentum === "strong-bullish" || momentum === "surging" ? "PUMP" : "DUMP"} — ${symbol}`;
            if (recentTitles.has(mTitle)) continue;
            const change24h = token.priceChange24h as number ?? 0;
            const change1h = token.priceChange1h as number ?? 0;
            const change5m = token.priceChange5m as number ?? 0;
            const change6h = token.priceChange6h as number ?? 0;
            const caution = token.caution as string ?? "";
            const source = token.source as string ?? "DexScreener";
            const sentiment = momentum === "strong-bullish" || momentum === "surging" ? "bullish" : "bearish";
            const riskLevel = token.riskLevel as string ?? "medium";
            const liquidity = token.liquidity as number ?? 0;
            const volume24h = token.volume24h as number ?? 0;
            const volume1h = token.volume1h as number ?? 0;
            const fdv = token.fdv as number ?? 0;
            const marketCap = token.marketCap as number ?? 0;
            const buys1h = token.txnsBuys1h as number ?? 0;
            const sells1h = token.txnsSells1h as number ?? 0;
            const buys24h = token.txnsBuys24h as number ?? 0;
            const sells24h = token.txnsSells24h as number ?? 0;
            const smartMoneyFlow = token.smartMoneyFlow as string ?? "Neutral";
            const holderConcentration = token.holderConcentration as string ?? "Insufficient data";
            const liquidityHealth = token.liquidityHealth as string ?? "Stable";
            const vipIndicators = token.vipIndicators as string[] ?? [];
            const chain = token.chain as string ?? "unknown";

            // Atomically increment the persistent meme counter
            const { data: counterResult } = await supabase.rpc("increment_meme_counter");
            const counterData = (counterResult ?? []) as Array<{ seq_number: number; entitlement: string }>;
            const seqNum = counterData[0]?.seq_number ?? 1;
            const memeEntitlement = (counterData[0]?.entitlement ?? "free") as "free" | "vip";
            const isVipMeme = memeEntitlement === "vip";

            // Build FREE meme message (basic)
            const freeMsg = `${symbol} ${momentum} on ${source}. 1h: ${change1h >= 0 ? "+" : ""}${change1h.toFixed(1)}%, 24h: ${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}%. ${caution ? "CAUTION: " + caution : ""}`;

            // Build VIP meme message (expanded analysis with real data)
            const fmtUsd = (v: number): string => v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(0);
            const buySellRatio1h = (buys1h + sells1h) > 0 ? ((buys1h / (buys1h + sells1h)) * 100).toFixed(0) + "%" : "N/A";
            const buySellRatio24h = (buys24h + sells24h) > 0 ? ((buys24h / (buys24h + sells24h)) * 100).toFixed(0) + "%" : "N/A";
            const volLiqRatio = liquidity > 0 ? (volume24h / liquidity).toFixed(1) : "N/A";

            const vipMsg = `<b>VIP MEME SIGNAL #${seqNum}</b>\n`
              + `#${symbol} ${momentum === "strong-bullish" || momentum === "surging" ? "PUMP" : "DUMP"} on ${source} (${chain})\n\n`
              + `<b>Price Action</b>\n`
              + `5m: ${change5m >= 0 ? "+" : ""}${change5m.toFixed(1)}% | 1h: ${change1h >= 0 ? "+" : ""}${change1h.toFixed(1)}% | 6h: ${change6h >= 0 ? "+" : ""}${change6h.toFixed(1)}% | 24h: ${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}%\n\n`
              + `<b>Liquidity & Volume</b>\n`
              + `Liquidity: ${fmtUsd(liquidity)} | Vol 24h: ${fmtUsd(volume24h)} | Vol 1h: ${fmtUsd(volume1h)}\n`
              + `Vol/Liq Ratio: ${volLiqRatio} | FDV: ${fmtUsd(fdv)} | MCap: ${fmtUsd(marketCap)}\n\n`
              + `<b>Buy/Sell Activity</b>\n`
              + `1h: ${buys1h} buys / ${sells1h} sells (${buySellRatio1h} buy)\n`
              + `24h: ${buys24h} buys / ${sells24h} sells (${buySellRatio24h} buy)\n\n`
              + `<b>Smart Money Flow</b>\n${smartMoneyFlow}\n`
              + `<b>Holder Concentration</b>\n${holderConcentration}\n`
              + `<b>Liquidity Health</b>\n${liquidityHealth}\n\n`
              + `<b>Risk Level</b>: ${riskLevel.toUpperCase()}\n`
              + (caution ? `<b>Caution</b>: ${caution}\n` : "")
              + (vipIndicators.length > 0 ? `\n<b>VIP Indicators</b>\n${vipIndicators.map((i) => "\u{2022} " + i).join("\n")}` : "");

            newSignals.push({
              engine_slug: "meme", title: mTitle,
              message: isVipMeme ? vipMsg : freeMsg,
              status: "pending",
              source_url: (token.dexUrl as string) ?? `https://dexscreener.com`,
              pair: symbol, sentiment, timeframe: "1h",
              indicators: isVipMeme ? ["MEME", ...vipIndicators] : ["MEME"],
              signalType: "meme", price: 0, priceChange: change24h, confidence: 80,
              is_vip: isVipMeme, entitlement: memeEntitlement,
            });
          }
        }
      }
    } catch { /* skip meme */ }

    // 7b. Scan stocks/commodities from stock_pairs table
    const { data: stockPairs } = await supabase.from("stock_pairs").select("*").eq("is_active", true);
    for (const sp of (stockPairs ?? []) as Array<{ symbol: string; name: string; asset_class: string; api_symbol: string }>) {
      try {
        const binanceSym = sp.api_symbol;
        // Check if this symbol exists on Binance
        const tickerResp = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${binanceSym}`, { signal: AbortSignal.timeout(5000) });
        if (!tickerResp.ok) continue; // Skip if Binance doesn't have this pair
        const ticker = await tickerResp.json() as Record<string, string>;
        const stockPrice = parseFloat(ticker.lastPrice);
        const stockChange = parseFloat(ticker.priceChangePercent);
        const stockVolume = parseFloat(ticker.quoteVolume);

        // Fetch klines for indicator analysis
        const klineResp = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${binanceSym}&interval=${timeframe}&limit=200`, { signal: AbortSignal.timeout(8000) });
        if (!klineResp.ok) continue;
        const rawKlines = await klineResp.json() as Array<Array<string | number>>;
        const closes = rawKlines.map((k) => Number(k[4]));
        if (closes.length < 30) continue;

        const rsi = computeRSI(closes, 14);
        const emaFast = computeEMA(closes.slice(-30), 12);
        const emaSlow = computeEMA(closes.slice(-30), 26);
        const macd = computeMACD(closes);
        const bb = computeBollingerBands(closes);
        const isBullishEma = emaFast > emaSlow;
        const macdBullish = macd.macdHistogram > 0;

        const triggered: string[] = [];
        let sentiment = "neutral";
        let strength = 0;

        if (rsi <= 30) { triggered.push("RSI"); sentiment = "bullish"; strength += 2; }
        else if (rsi >= 70) { triggered.push("RSI"); sentiment = "bearish"; strength += 2; }
        if (isBullishEma) { triggered.push("EMA"); if (sentiment !== "bearish") sentiment = "bullish"; strength += 1; }
        else { triggered.push("EMA"); if (sentiment !== "bullish") sentiment = "bearish"; strength += 1; }
        if (macdBullish) { triggered.push("MACD"); if (sentiment !== "bearish") sentiment = "bullish"; strength += 1; }
        else { triggered.push("MACD"); if (sentiment !== "bullish") sentiment = "bearish"; strength += 1; }
        if (stockPrice <= bb.lower) { triggered.push("BB"); if (sentiment !== "bearish") sentiment = "bullish"; strength += 1; }
        else if (stockPrice >= bb.upper) { triggered.push("BB"); if (sentiment !== "bullish") sentiment = "bearish"; strength += 1; }

        if (strength < 2 && rsi > 30 && rsi < 70) continue;

        const sConfidence = Math.min(100, Math.round((strength / 5) * 100));
        const assetLabel = sp.asset_class === "commodity" ? "COMMODITY" : sp.asset_class === "index" ? "INDEX" : "STOCK";
        const sTradeType = futuresPairs.has(binanceSym) ? "FUTURES" : "SPOT";
        const sLevels = computeTradeLevels(stockPrice, sentiment, rsi, bb, 0);
        let sTitle = `[${sTradeType}] ${sp.symbol} ${sentiment === "bullish" ? "LONG" : "SHORT"} — ${sConfidence}% (${timeframe})`;
        if (recentTitles.has(sTitle)) continue;
        const sMessage = buildSignalMessage({ baseAsset: sp.symbol, symbol: binanceSym }, sTradeType, sentiment, rsi, macdBullish, bb, stockPrice, stockChange, sConfidence, sLevels, timeframe, 0);

        newSignals.push({
          engine_slug: "scalping", title: sTitle, message: sMessage, status: "pending",
          source_url: `https://www.binance.com/en/trade/${binanceSym}`,
          pair: sp.symbol, sentiment, timeframe,
          indicators: triggered, signalType: "stock", price: stockPrice, priceChange: stockChange, confidence: sConfidence,
          is_vip: false, entitlement: "free",
        });
      } catch { /* skip stock */ }
    }

    // 7c. Run news desk and generate news signals for high-impact articles
    try {
      const newsResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/news-desk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`, "Content-Type": "application/json" },
      });
      if (newsResp.ok) {
        const newsData = await newsResp.json();
        for (const article of (newsData.items ?? []).slice(0, 10) as Array<Record<string, unknown>>) {
          const sentiment = article.sentiment as string ?? "neutral";
          const keywords = article.keywords as string[] ?? [];
          // Only generate news signals for clearly bullish or bearish articles
          if (sentiment === "neutral" || keywords.length < 1) continue;
          const title = article.title as string;
          const nTitle = `News ${sentiment.toUpperCase()} — ${title.slice(0, 60)}`;
          if (recentTitles.has(nTitle)) continue;
          const source = article.source as string ?? "";
          const url = article.url as string ?? "";
          newSignals.push({
            engine_slug: "news", title: nTitle,
            message: `${title}\nSource: ${source}\nKeywords: ${keywords.slice(0, 5).map((k) => "#" + k).join(" ")}`,
            status: "pending", source_url: url, pair: null, sentiment, timeframe: "1h",
            indicators: ["NEWS"], signalType: "news", price: 0, priceChange: 0, confidence: 70,
            is_vip: false, entitlement: "free",
          });
        }
      }
    } catch { /* skip news */ }

    log.push(`${newSignals.length} qualifying signals after dedup`);

    if (newSignals.length === 0) {
      await supabase.from("system_logs").insert({ level: "info", engine_slug: "scalping", message: `Signal engine ran (${timeframe}) — no new qualifying signals. ${eligible.length} pairs scanned.` });
      return new Response(JSON.stringify({ signalsGenerated: 0, scanned: eligible.length, log }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 7. Rate limiting: digest mode
    const scalpingSignals = newSignals.filter((s) => s.engine_slug === "scalping");
    const otherSignals = newSignals.filter((s) => s.engine_slug !== "scalping");
    const useDigest = scalpingSignals.length > DIGEST_THRESHOLD;

    let signalsToSend = [...newSignals];
    let digestItems: Array<{ title: string; detail: string; sentiment: string }> = [];

    if (useDigest) {
      const sorted = [...scalpingSignals].sort((a, b) => (b.indicators?.length ?? 0) - (a.indicators?.length ?? 0));
      signalsToSend = [...sorted.slice(0, MAX_INDIVIDUAL_SIGNALS), ...otherSignals];
      digestItems = sorted.slice(MAX_INDIVIDUAL_SIGNALS).map((s) => ({ title: s.title, detail: s.message ?? "", sentiment: s.sentiment ?? "neutral" }));
      log.push(`Digest mode: ${MAX_INDIVIDUAL_SIGNALS} individual + ${digestItems.length} in digest`);
    }

    // 8. Insert into DB
    const dbRows = signalsToSend.slice(0, 30).map((s) => ({
      engine_slug: s.engine_slug, title: s.title, message: s.message,
      status: "pending", source_url: s.source_url, pair: s.pair,
      sentiment: s.sentiment, timeframe: s.timeframe, indicators: s.indicators,
      is_vip: (s as Record<string, unknown>).is_vip ?? false,
      entitlement: (s as Record<string, unknown>).entitlement ?? "free",
      entry_price: (s as Record<string, unknown>).entry_price ?? null,
      tp1_price: (s as Record<string, unknown>).tp1_price ?? null,
      tp2_price: (s as Record<string, unknown>).tp2_price ?? null,
      tp3_price: (s as Record<string, unknown>).tp3_price ?? null,
      stop_loss_price: (s as Record<string, unknown>).stop_loss_price ?? null,
    }));
    const { data: inserted, error: insertErr } = await supabase.from("signals").insert(dbRows).select("*");
    if (insertErr) { log.push(`DB error: ${insertErr.message}`); return new Response(JSON.stringify({ error: insertErr.message, log }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    log.push(`Inserted ${inserted?.length ?? 0} signals`);

    // 9. Send to Telegram bots via sendPhoto with real candlestick charts
    let sentCount = 0, failedCount = 0;

    // Fetch real klines from Binance for a pair
    async function fetchKlinesForChart(symbol: string, interval: string, limit = 48): Promise<Array<{ o: number; h: number; l: number; c: number; v: number }>> {
      try {
        const resp = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) return [];
        const raw = await resp.json() as Array<Array<string | number>>;
        return raw.map((k) => ({ o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) }));
      } catch { return []; }
    }

    // Compute EMA array for chart overlay
    function computeEMAArrayChart(closes: number[], period: number): number[] {
      if (closes.length === 0) return [];
      const k = 2 / (period + 1);
      const result: number[] = [closes[0]];
      for (let i = 1; i < closes.length; i++) result.push(closes[i] * k + result[i - 1] * (1 - k));
      return result;
    }

    // Build a real candlestick chart URL using QuickChart with chartjs-chart-financial
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
      const isBull = sentiment === "bullish";
      const accentColor = isBull ? "#22c55e" : sentiment === "bearish" ? "#ef4444" : "#22d3ee";

      // Limit to last 30 candles for readability
      const displayCandles = candles.slice(-30);
      const displayCloses = closes.slice(-30);

      // Candlestick data: {o, h, l, c}
      const candleData = displayCandles.map((c, i) => ({ x: i, o: c.o, h: c.h, l: c.l, c: c.c }));

      // EMA fast (12) and slow (26) overlays
      const emaFastArr = computeEMAArrayChart(displayCloses, 12);
      const emaSlowArr = computeEMAArrayChart(displayCloses, 26);

      // Bollinger Bands
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
          type: "line",
          label: "EMA 12",
          data: emaFastArr.map((y, x) => ({ x, y })),
          borderColor: "rgba(34,211,238,0.8)",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          type: "line",
          label: "EMA 26",
          data: emaSlowArr.map((y, x) => ({ x, y })),
          borderColor: "rgba(245,158,11,0.8)",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          type: "line",
          label: "BB Upper",
          data: bbUpper.map((y, x) => ({ x, y })),
          borderColor: "rgba(100,116,139,0.3)",
          backgroundColor: "transparent",
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          borderDash: [4, 4],
        },
        {
          type: "line",
          label: "BB Lower",
          data: bbLower.map((y, x) => ({ x, y })),
          borderColor: "rgba(100,116,139,0.3)",
          backgroundColor: "transparent",
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          borderDash: [4, 4],
        },
      ];

      // Add entry/SL/TP as horizontal annotation lines
      const annotations: Record<string, unknown> = {};
      if (entryPrice !== undefined && entryPrice > 0) {
        annotations.entry = {
          type: "line",
          yMin: entryPrice,
          yMax: entryPrice,
          borderColor: "rgba(34,211,238,0.9)",
          borderWidth: 2,
          borderDash: [6, 4],
          label: { display: true, content: "Entry", position: "start", color: "#22d3ee", font: { size: 10 } },
        };
      }
      if (stopLoss !== undefined && stopLoss > 0) {
        annotations.sl = {
          type: "line",
          yMin: stopLoss,
          yMax: stopLoss,
          borderColor: "rgba(239,68,68,0.9)",
          borderWidth: 2,
          borderDash: [6, 4],
          label: { display: true, content: "SL", position: "start", color: "#ef4444", font: { size: 10 } },
        };
      }
      if (takeProfits) {
        takeProfits.forEach((tp, i) => {
          if (tp > 0) {
            annotations[`tp${i + 1}`] = {
              type: "line",
              yMin: tp,
              yMax: tp,
              borderColor: "rgba(34,197,94,0.7)",
              borderWidth: 1.5,
              borderDash: [6, 4],
              label: { display: true, content: `TP${i + 1}`, position: "start", color: "#22c55e", font: { size: 10 } },
            };
          }
        });
      }

      const rsiWeight = indicators.includes("RSI") ? 2 : 0;
      const otherCount = indicators.filter((i) => i !== "RSI").length;
      const strength = rsiWeight + otherCount;
      const confidence = Math.min(100, Math.round((strength / 5) * 100));
      const sentimentText = isBull ? "BULLISH" : sentiment === "bearish" ? "BEARISH" : "NEUTRAL";

      const chartConfig = {
        type: "candlestick",
        data: { labels, datasets },
        options: {
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: [`${engineTitle} — ${pairLabel}`, `${sentimentText} | Confidence: ${confidence}% | ${timeframe}`],
              color: "#ffffff",
              font: { size: 14 },
            },
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

    // Build a simple price line chart for non-crypto signals (whale, news, meme)
    function buildPriceLineChartUrl(
      closes: number[],
      pairLabel: string,
      sentiment: string,
      engineTitle: string,
    ): string {
      const isBull = sentiment === "bullish";
      const lineColor = isBull ? "rgba(34,197,94,1)" : sentiment === "bearish" ? "rgba(239,68,68,1)" : "rgba(34,211,238,1)";
      const fillColor = isBull ? "rgba(34,197,94,0.12)" : sentiment === "bearish" ? "rgba(239,68,68,0.12)" : "rgba(34,211,238,0.12)";
      const sentimentText = isBull ? "BULLISH" : sentiment === "bearish" ? "BEARISH" : "NEUTRAL";

      const chartConfig = {
        type: "line",
        data: {
          labels: closes.map((_, i) => i),
          datasets: [{
            label: pairLabel,
            data: closes,
            borderColor: lineColor,
            backgroundColor: fillColor,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          }],
        },
        options: {
          plugins: {
            legend: { display: false },
            title: { display: true, text: [`${engineTitle} — ${pairLabel}`, sentimentText], color: "#ffffff", font: { size: 14 } },
            watermark: { text: "CryptoCommand", color: "rgba(148,163,184,0.06)", fontSize: 36, fontFamily: "sans-serif", rotation: -25, opacity: 0.3, alignX: "center", alignY: "center" },
          },
          scales: {
            x: { display: false },
            y: { grid: { color: "rgba(30,41,59,0.4)" }, ticks: { color: "#64748b", font: { size: 9 } } },
          },
        },
      };
      return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&v=3&w=600&h=400&bkg=rgb(15,23,42)`;
    }

    // Parse trade levels from the signal message
    function parseTradeLevels(message: string): { entry?: number; stopLoss?: number; takeProfits?: number[] } {
      const entryMatch = message.match(/Entry:\s*\$?([\d.]+)/);
      const slMatch = message.match(/Stop Loss:\s*\$?([\d.]+)/);
      const tpMatches = [...message.matchAll(/Target \d:\s*\$?([\d.]+)/g)];
      return {
        entry: entryMatch ? parseFloat(entryMatch[1]) : undefined,
        stopLoss: slMatch ? parseFloat(slMatch[1]) : undefined,
        takeProfits: tpMatches.map((m) => parseFloat(m[1])),
      };
    }

    for (const sig of inserted ?? []) {
      const original = signalsToSend.find((s) => s.title === sig.title);
      const isVipSignal = (original as Record<string, unknown> | undefined)?.is_vip === true;
      const signalEntitlement = ((sig as Record<string, unknown>).entitlement as string) ?? (isVipSignal ? "vip" : "free");

      // Determine target bots: admin config (bot_engine_routes) + entitlement → channel type
      // VIP signals go to BOTH VIP (full content) and FREE (locked teaser)
      const allowedBotIds = routes.filter((r) => r.engine_slug === sig.engine_slug).map((r) => r.bot_id);
      const targetBots = bots.filter((b) => {
        if (!allowedBotIds.includes(b.id)) return false;
        // FREE entitlement → FREE channel only; VIP entitlement → BOTH channels
        if (signalEntitlement === "vip") return true; // VIP goes to all allowed channels
        return b.channel_type === "free";
      });

      if (targetBots.length === 0) {
        await supabase.from("signals").update({ status: "skipped" }).eq("id", sig.id);
        continue;
      }

      // Create delivery records for each target bot
      const deliveryRows = targetBots.map((b) => ({
        signal_id: sig.id,
        bot_id: b.id,
        channel_type: b.channel_type,
        channel_id: b.chat_id,
        entitlement: signalEntitlement,
        status: "pending",
      }));
      await supabase.from("signal_deliveries").insert(deliveryRows);

      // Helper: resolve the subscribe URL for a free channel bot (from its linked VIP bot)
      async function resolveSubscribeUrl(freeBot: Record<string, unknown>): Promise<string> {
        const linkedId = freeBot.linked_vip_bot_id as string | null;
        if (linkedId) {
          const { data: linkedBot } = await supabase.from("telegram_bots")
            .select("sub_bot_username").eq("id", linkedId).maybeSingle() as { data: Record<string, unknown> | null };
          const subUrl = (linkedBot?.sub_bot_username as string) ?? "";
          if (subUrl) return normalizeTgUrl(subUrl);
        }
        const { data: globalSettings } = await supabase.from("vip_settings").select("vip_subscribe_url").limit(1).maybeSingle() as { data: Record<string, unknown> | null };
        const globalUrl = (globalSettings?.vip_subscribe_url as string) ?? "";
        if (globalUrl) return normalizeTgUrl(globalUrl);
        return "";
      }

      function normalizeTgUrl(url: string): string {
        if (url.startsWith("http")) return url;
        if (url.startsWith("@")) return `https://t.me/${url.slice(1)}`;
        if (url.startsWith("t.me")) return `https://${url}`;
        return `https://t.me/${url}`;
      }

      // Build the caption — scalping signals already have VIP format in message
      const engineTitle = sig.engine_slug === "whale" ? "WHALE ALERT" : sig.engine_slug === "news" ? "NEWS ALERT" : sig.engine_slug === "meme" ? "MEME ALERT" : "SIGNAL ALERT";

      function buildFullCaption(): string {
        let cap: string;
        if (sig.engine_slug === "scalping") {
          cap = sig.message ?? "";
        } else {
          const isBull = sig.sentiment === "bullish";
          const dirEmoji = isBull ? "\u{1F7E2}" : sig.sentiment === "bearish" ? "\u{1F534}" : "\u{26AA}";
          const dirLabel = isBull ? "Long" : sig.sentiment === "bearish" ? "Short" : "Neutral";
          const pairStr = sig.pair ?? "";
          cap = `#${pairStr} - ${dirLabel} ${dirEmoji}\n\n`;
          cap += sig.message ?? "";
        }
        return cap.length > 1024 ? cap.slice(0, 1020) + "..." : cap;
      }

      // Build the chart image URL with real market data
      let chartUrl = "";
      const chartPairLabel = sig.pair ?? "CHART";
      const tf = sig.timeframe ?? "1h";
      const sentimentText = sig.sentiment === "bullish" ? "BULLISH" : sig.sentiment === "bearish" ? "BEARISH" : "NEUTRAL";

      if (sig.engine_slug === "scalping" && sig.pair) {
        // Fetch real klines for candlestick chart
        const binanceSymbol = sig.pair.replace("/", "");
        const candles = await fetchKlinesForChart(binanceSymbol, tf, 48);
        if (candles.length >= 10) {
          const closes = candles.map((c) => c.c);
          const levels = parseTradeLevels(sig.message ?? "");
          chartUrl = buildCandlestickChartUrl(
            candles, closes, chartPairLabel, sig.sentiment ?? "neutral",
            tf, sig.indicators ?? [], engineTitle,
            levels.entry, levels.stopLoss, levels.takeProfits,
          );
        } else {
          // Fallback: line chart with whatever closes we have
          chartUrl = buildPriceLineChartUrl(candles.map((c) => c.c), chartPairLabel, sig.sentiment ?? "neutral", engineTitle);
        }
      } else if (sig.engine_slug === "whale" && sig.pair) {
        // Whale alert: fetch BTC klines for context
        const candles = await fetchKlinesForChart("BTCUSDT", "1h", 30);
        chartUrl = buildPriceLineChartUrl(candles.map((c) => c.c), chartPairLabel, sig.sentiment ?? "neutral", engineTitle);
      } else if (sig.engine_slug === "meme" && sig.pair) {
        // Meme: try to fetch from Binance, otherwise use a simple chart
        const binanceSymbol = `${sig.pair.replace("-RH", "")}USDT`;
        const candles = await fetchKlinesForChart(binanceSymbol, "1h", 30);
        if (candles.length >= 5) {
          chartUrl = buildPriceLineChartUrl(candles.map((c) => c.c), chartPairLabel, sig.sentiment ?? "neutral", engineTitle);
        } else {
          // No Binance data for this meme token — use a sentiment-based chart
          const isBull = sig.sentiment === "bullish";
          const mockCloses = isBull
            ? [100, 102, 99, 105, 103, 108, 112, 110, 115, 120]
            : [120, 118, 115, 112, 110, 108, 105, 103, 100, 95];
          chartUrl = buildPriceLineChartUrl(mockCloses, chartPairLabel, sig.sentiment ?? "neutral", engineTitle);
        }
      } else if (sig.engine_slug === "news") {
        // News: sentiment bar chart
        const isBull = sig.sentiment === "bullish";
        const newsChartConfig = {
          type: "bar",
          data: {
            labels: ["Bullish", "Neutral", "Bearish"],
            datasets: [{
              data: [isBull ? 1 : 0, sig.sentiment === "neutral" ? 1 : 0, !isBull && sig.sentiment !== "neutral" ? 1 : 0],
              backgroundColor: ["rgba(34,197,94,0.7)", "rgba(100,116,139,0.7)", "rgba(239,68,68,0.7)"],
              borderColor: ["rgb(34,197,94)", "rgb(100,116,139)", "rgb(239,68,68)"],
              borderWidth: 1,
            }],
          },
          options: {
            plugins: {
              legend: { display: false },
              title: { display: true, text: [engineTitle, sentimentText], color: "#ffffff", font: { size: 14 } },
              watermark: { text: "CryptoCommand", color: "rgba(148,163,184,0.06)", fontSize: 36, fontFamily: "sans-serif", rotation: -25, opacity: 0.3, alignX: "center", alignY: "center" },
            },
            scales: {
              x: { grid: { color: "rgba(30,41,59,0.3)" }, ticks: { color: "#94a3b8", font: { size: 11 } } },
              y: { display: false },
            },
          },
        };
        chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(newsChartConfig))}&v=3&w=600&h=400&bkg=rgb(15,23,42)`;
      } else {
        chartUrl = buildPriceLineChartUrl([100, 102, 98, 105, 103, 108, 110], chartPairLabel, sig.sentiment ?? "neutral", engineTitle);
      }

      // Build inline keyboard — only referral links from admin panel, no hardcoded Binance
      function buildReferralRows(): Array<Array<{ text: string; url: string }>> {
        const rows: Array<Array<{ text: string; url: string }>> = [];
        for (const rl of referralLinks) {
          rows.push([{ text: rl.exchange_name, url: rl.referral_url }]);
        }
        return rows;
      }

      function buildVipKeyboard(): Record<string, unknown> {
        const rows = buildReferralRows();
        const inlineRows: Array<Array<{ text: string; url: string }>> = [];
        for (let i = 0; i < rows.length; i += 2) {
          inlineRows.push(rows.slice(i, i + 2).flat());
        }
        return { inline_keyboard: inlineRows };
      }

      function buildFreeKeyboard(subscribeUrl: string): Record<string, unknown> {
        const rows = buildReferralRows();
        if (subscribeUrl) {
          rows.push([{ text: "UNLOCK ALL TARGETS (BUY VIP)", url: subscribeUrl }]);
        }
        return { inline_keyboard: rows };
      }

      for (const bot of targetBots) {
        const isFreeChannel = bot.channel_type === "free";
        const isVipOnFree = isFreeChannel && signalEntitlement === "vip";
        // VIP signals on FREE channel get locked teaser; everything else gets full caption
        const caption = isVipOnFree
          ? buildLockedCaption({ engine_slug: sig.engine_slug, title: sig.title, pair: sig.pair as string | null, sentiment: sig.sentiment as string | null })
          : buildFullCaption();
        let keyboard: Record<string, unknown>;
        if (isFreeChannel) {
          const subUrl = await resolveSubscribeUrl(bot as unknown as Record<string, unknown>);
          keyboard = buildFreeKeyboard(subUrl);
        } else {
          keyboard = buildVipKeyboard();
        }

        // Retry logic: up to 3 attempts with backoff
        const maxAttempts = 3;
        const backoffMs = [0, 2000, 5000];
        let deliverySuccess = false;
        let telegramMessageId: string | null = null;
        let lastError = "";

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (attempt > 1) await new Promise((r) => setTimeout(r, backoffMs[attempt - 1] ?? 5000));

          try {
            const tgUrl = `https://api.telegram.org/bot${bot.bot_token}/sendPhoto`;
            const tgResp = await fetch(tgUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: bot.chat_id,
                photo: chartUrl,
                caption: caption,
                parse_mode: "HTML",
                reply_markup: keyboard,
              }),
              signal: AbortSignal.timeout(15000),
            });
            const tgData = await tgResp.json();

            if (tgResp.ok && tgData.ok) {
              deliverySuccess = true;
              telegramMessageId = tgData.result?.message_id != null ? String(tgData.result.message_id) : null;
              break;
            }

            lastError = `sendPhoto: ${tgData.description ?? tgResp.statusText ?? "unknown"}`;

            // Fallback: sendMessage without image
            const fbResp = await fetch(`https://api.telegram.org/bot${bot.bot_token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: bot.chat_id, text: caption, parse_mode: "HTML", reply_markup: keyboard, disable_web_page_preview: true }),
              signal: AbortSignal.timeout(10000),
            });
            const fbData = await fbResp.json();
            if (fbResp.ok && fbData.ok) {
              deliverySuccess = true;
              telegramMessageId = fbData.result?.message_id != null ? String(fbData.result.message_id) : null;
              break;
            }
            lastError = `sendMessage: ${fbData.description ?? fbResp.statusText ?? "unknown"}`;
          } catch (err) {
            lastError = err instanceof Error ? err.message : "fetch failed";
          }
        }

        // Update the delivery record
        const deliveryUpdate: Record<string, unknown> = {
          attempts: maxAttempts,
          last_attempt_at: new Date().toISOString(),
          error_message: deliverySuccess ? null : lastError,
        };
        if (deliverySuccess) {
          deliveryUpdate.status = "sent";
          deliveryUpdate.telegram_message_id = telegramMessageId;
          deliveryUpdate.delivered_at = new Date().toISOString();
          sentCount++;
        } else {
          deliveryUpdate.status = "failed";
          failedCount++;
          await supabase.from("system_logs").insert({
            level: "error",
            engine_slug: sig.engine_slug,
            message: `Telegram delivery failed: signal="${sig.title}" bot="${bot.name}" channel_id="${bot.chat_id}" attempts=${maxAttempts} error="${lastError}"`,
          });
        }
        await supabase.from("signal_deliveries")
          .update(deliveryUpdate)
          .eq("signal_id", sig.id)
          .eq("bot_id", bot.id);
      }

      // Update signal status based on delivery results
      const { data: delivStatus } = await supabase.from("signal_deliveries")
        .select("status").eq("signal_id", sig.id);
      const allDeliveries = (delivStatus ?? []) as Array<{ status: string }>;
      const anySent = allDeliveries.some((d) => d.status === "sent");
      const allFailed = allDeliveries.length > 0 && allDeliveries.every((d) => d.status === "failed");
      const newStatus = anySent ? "sent" : allFailed ? "failed" : "skipped";
      await supabase.from("signals").update({ status: newStatus }).eq("id", sig.id);
    }

    // 10. Send market summary digest (brief overview, no signal details)
    if (useDigest && digestItems.length > 0) {
      for (const bot of bots) {
        const allowed = routes.some((r) => r.bot_id === bot.id && r.engine_slug === "scalping");
        if (!allowed) continue;
        try {
          const bullCount = digestItems.filter((d) => d.sentiment === "bullish").length;
          const bearCount = digestItems.filter((d) => d.sentiment === "bearish").length;
          const neutralCount = digestItems.length - bullCount - bearCount;
          const overallSentiment = bullCount > bearCount ? "BULLISH" : bearCount > bullCount ? "BEARISH" : "MIXED";
          const sentimentEmoji = bullCount > bearCount ? "\u{1F7E2}" : bearCount > bullCount ? "\u{1F534}" : "\u{26AA}";

          // Collect unique pairs from digest items for a brief mention
          const digestPairs = new Set<string>();
          for (const item of digestItems) {
            const pairMatch = item.title.match(/\]?\s*(\w+)\s+(?:STRONG\s+)?(?:LONG|SHORT|OVERSOLD|OVERBOUGHT)/);
            if (pairMatch) digestPairs.add(pairMatch[1]);
          }
          const topPairs = Array.from(digestPairs).slice(0, 8).join(", ");

          let dMsg = `<b>MARKET SUMMARY</b>\n${timeframe.toUpperCase()} | ${digestItems.length} signals detected\n\n`;
          dMsg += `${sentimentEmoji} Overall: <b>${overallSentiment}</b>\n`;
          dMsg += `\u{1F7E2} Bullish: ${bullCount}  \u{1F534} Bearish: ${bearCount}`;
          if (neutralCount > 0) dMsg += `  \u{26AA} Neutral: ${neutralCount}`;
          dMsg += `\n`;
          if (topPairs) dMsg += `Pairs: ${topPairs}\n`;
          dMsg += `\nFull signals sent individually above`;

          const dRows: Array<Array<{ text: string; url: string }>> = [];
          for (const rl of referralLinks) {
            dRows.push([{ text: rl.exchange_name, url: rl.referral_url }]);
          }
          const dKeyboard = { inline_keyboard: dRows };

          const digestChartConfig = {
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
                title: { display: true, text: `Market Summary — ${timeframe}`, color: "#ffffff", font: { size: 14 } },
                watermark: { text: "CryptoCommand", color: "rgba(148,163,184,0.06)", fontSize: 36, fontFamily: "sans-serif", rotation: -25, opacity: 0.3, alignX: "center", alignY: "center" },
              },
            },
          };
          const digestChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(digestChartConfig))}&v=3&w=600&h=400&bkg=rgb(15,23,42)`;
          const finalCaption = dMsg.length > 1024 ? dMsg.slice(0, 1020) + "..." : dMsg;

          await fetch(`https://api.telegram.org/bot${bot.bot_token}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: bot.chat_id,
              photo: digestChartUrl,
              caption: finalCaption,
              parse_mode: "HTML",
              reply_markup: dKeyboard,
            }),
            signal: AbortSignal.timeout(15000),
          });
          sentCount++;
        } catch { /* skip */ }
      }
    }

    // 11. Update engine counters
    const engineCounts: Record<string, number> = {};
    newSignals.forEach((s) => { engineCounts[s.engine_slug] = (engineCounts[s.engine_slug] ?? 0) + 1; });
    for (const [slug, count] of Object.entries(engineCounts)) {
      const { data: eng } = await supabase.from("bot_engines").select("signals_today, last_signal_at").eq("slug", slug).maybeSingle();
      if (eng) await supabase.from("bot_engines").update({ signals_today: (eng.signals_today ?? 0) + count, last_signal_at: new Date().toISOString() }).eq("slug", slug);
    }

    await supabase.from("system_logs").insert({ level: "success", engine_slug: "scalping", message: `Signal engine auto-ran (${timeframe}): ${sentCount} sent, ${failedCount} failed, ${newSignals.length} generated from ${eligible.length} pairs` });

    log.push(`Done: ${sentCount} sent, ${failedCount} failed`);
    return new Response(JSON.stringify({ signalsGenerated: newSignals.length, sent: sentCount, failed: failedCount, scanned: eligible.length, log }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
