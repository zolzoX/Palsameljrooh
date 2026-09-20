import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h"];
const MIN_VOLUME_USD = 10_000_000;
const MAX_PAIRS_TO_PROCESS = 15;

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeEMAArray(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function computeMACD(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod + signalPeriod) {
    return { macdLine: 0, macdSignal: 0, macdHistogram: 0 };
  }
  const fastEMA = computeEMAArray(closes, fastPeriod);
  const slowEMA = computeEMAArray(closes, slowPeriod);
  const macdValues: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdValues.push(fastEMA[i] - slowEMA[i]);
  }
  const signalValues = computeEMAArray(macdValues.slice(-slowPeriod), signalPeriod);
  const macdLine = macdValues[macdValues.length - 1];
  const macdSignal = signalValues[signalValues.length - 1] ?? 0;
  const macdHistogram = macdLine - macdSignal;
  return { macdLine, macdSignal, macdHistogram };
}

function computeBollingerBands(closes: number[], period = 20, stdDev = 2) {
  if (closes.length < period) {
    const last = closes[closes.length - 1] ?? 0;
    return { upper: last, middle: last, lower: last };
  }
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: middle + stdDev * sd, middle, lower: middle - stdDev * sd };
}

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface TimeframeData {
  rsi: number;
  emaFast: number;
  emaSlow: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  trend: string;
  klines: Kline[];
}

interface PairResult {
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  rsi: number;
  emaFast: number;
  emaSlow: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  trend: string;
  volume: number;
  klines: Kline[];
  timeframe: string;
  timeframes: Record<string, TimeframeData>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let timeframe = "1h";
    try {
      const body = await req.json();
      if (body?.timeframe && VALID_TIMEFRAMES.includes(body.timeframe)) {
        timeframe = body.timeframe;
      }
    } catch { /* default */ }

    // Fetch signal_config
    const { data: configs } = await supabase.from("signal_config").select("*");
    const configMap: Record<string, Record<string, number>> = {};
    for (const cfg of configs ?? []) {
      configMap[cfg.timeframe] = cfg;
    }

    // Step 1: Fetch ALL USDT 24h tickers from Binance
    const tickerResp = await fetch(
      "https://data-api.binance.vision/api/v3/ticker/24hr",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!tickerResp.ok) throw new Error("Failed to fetch Binance tickers");
    const allTickers = await tickerResp.json() as Array<Record<string, string>>;

    // Filter: USDT pairs with volume > $10M, exclude leveraged tokens (UP/DOWN/BULL/BEAR)
    const eligiblePairs = allTickers
      .filter((t) => {
        const sym = t.symbol ?? "";
        if (!sym.endsWith("USDT")) return false;
        // Exclude leveraged tokens
        if (sym.includes("UPUSDT") || sym.includes("DOWNUSDT") || sym.includes("BULLUSDT") || sym.includes("BEARUSDT")) return false;
        // Exclude stablecoins trading against USDT
        const stablecoins = ["USDCUSDT", "BUSDUSDT", "TUSDUSDT", "FDUSDUSDT", "DAIUSDT", "EURUSDT", "GBPUSDT"];
        if (stablecoins.includes(sym)) return false;
        const vol = parseFloat(t.quoteVolume ?? "0");
        return vol >= MIN_VOLUME_USD;
      })
      .map((t) => ({
        symbol: t.symbol,
        baseAsset: t.symbol.replace("USDT", ""),
        price: parseFloat(t.lastPrice),
        priceChange: parseFloat(t.priceChangePercent),
        volume: parseFloat(t.quoteVolume),
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, MAX_PAIRS_TO_PROCESS);

    // Always include BTC, ETH, SOL even if volume dips
    const mustInclude = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    for (const sym of mustInclude) {
      if (!eligiblePairs.some((p) => p.symbol === sym)) {
        const t = allTickers.find((tt) => tt.symbol === sym);
        if (t) {
          eligiblePairs.push({
            symbol: sym,
            baseAsset: sym.replace("USDT", ""),
            price: parseFloat(t.lastPrice),
            priceChange: parseFloat(t.priceChangePercent),
            volume: parseFloat(t.quoteVolume),
          });
        }
      }
    }

    // Step 2: For each eligible pair, fetch klines for the selected timeframe
    const results: PairResult[] = [];

    for (const pair of eligiblePairs) {
      try {
        const tfData: Record<string, TimeframeData> = {};

        // Only fetch the selected timeframe to save API calls
        const cfg = configMap[timeframe] ?? {};
        const klineResp = await fetch(
          `https://data-api.binance.vision/api/v3/klines?symbol=${pair.symbol}&interval=${timeframe}&limit=200`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!klineResp.ok) continue;
        const rawKlines = await klineResp.json() as Array<Array<string | number>>;
        const klines: Kline[] = rawKlines.map((k) => ({
          openTime: Number(k[0]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
          closeTime: Number(k[6]),
        }));
        const closes = klines.map((k) => k.close);
        if (closes.length < 30) continue;

        const rsi = computeRSI(closes, 14);
        const emaFast = computeEMA(closes.slice(-30), cfg.ema_fast_period ?? 12);
        const emaSlow = computeEMA(closes.slice(-30), cfg.ema_slow_period ?? 26);
        const macd = computeMACD(closes, cfg.macd_fast ?? 12, cfg.macd_slow ?? 26, cfg.macd_signal ?? 9);
        const bb = computeBollingerBands(closes, cfg.bb_period ?? 20, cfg.bb_std_dev ?? 2);
        const trend = emaFast > emaSlow ? "bullish" : emaFast < emaSlow ? "bearish" : "neutral";

        tfData[timeframe] = {
          rsi, emaFast, emaSlow,
          macdLine: macd.macdLine, macdSignal: macd.macdSignal, macdHistogram: macd.macdHistogram,
          bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower,
          trend, klines: klines.slice(-48),
        };

        results.push({
          symbol: pair.baseAsset,
          name: pair.baseAsset,
          price: pair.price,
          priceChange24h: pair.priceChange,
          rsi, emaFast, emaSlow,
          macdLine: macd.macdLine, macdSignal: macd.macdSignal, macdHistogram: macd.macdHistogram,
          bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower,
          trend, volume: pair.volume,
          klines: klines.slice(-48),
          timeframe,
          timeframes: tfData,
        });

        // Update DB (only for top pairs to avoid spam)
        if (["BTC", "ETH", "SOL"].includes(pair.baseAsset)) {
          await supabase.from("scalping_pairs").upsert({
            symbol: pair.baseAsset,
            name: pair.baseAsset,
            price: pair.price,
            price_change_24h: pair.priceChange,
            rsi, ema_fast: emaFast, ema_slow: emaSlow,
            macd_line: macd.macdLine, macd_signal: macd.macdSignal, macd_histogram: macd.macdHistogram,
            bb_upper: bb.upper, bb_middle: bb.middle, bb_lower: bb.lower,
            trend, volume: pair.volume,
            updated_at: new Date().toISOString(),
          }, { onConflict: "symbol" });
        }
      } catch {
        // skip this pair
      }
    }

    await supabase.from("system_logs").insert({
      level: "success",
      engine_slug: "scalping",
      message: `Market scan complete — ${results.length} pairs scanned (${timeframe}) · RSI+EMA+MACD+BB · Binance API`,
    });

    return new Response(
      JSON.stringify({ pairs: results, timeframe, scanned: eligiblePairs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
