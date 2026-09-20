import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch current BTC price to compute the USD threshold dynamically
    let btcPrice = 80000;
    try {
      const btcTickerResp = await fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT", { signal: AbortSignal.timeout(5000) });
      if (btcTickerResp.ok) {
        const btcTicker = await btcTickerResp.json() as { price: string };
        btcPrice = parseFloat(btcTicker.price);
      }
    } catch { /* use fallback */ }

    // Aggregated threshold: >= 10 BTC equivalent; single-trade threshold: >= 1 BTC equiv
    const aggThreshold = 10 * btcPrice;
    const singleTradeThreshold = 1 * btcPrice;

    // 50 major cryptocurrencies by market cap and relevance
    const PAIRS = [
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

    const newAlerts: Array<{
      asset: string;
      amount: number;
      usd_value: number;
      direction: string;
      from_addr: string;
      to_addr: string;
    }> = [];

    // Process pairs in parallel batches of 10 to stay within timeouts
    const batchSize = 10;
    for (let batchStart = 0; batchStart < PAIRS.length; batchStart += batchSize) {
      const batch = PAIRS.slice(batchStart, batchStart + batchSize);
      const results = await Promise.allSettled(batch.map(async (pair) => {
        const pairAlerts: typeof newAlerts = [];
        try {
          const resp = await fetch(
            `https://data-api.binance.vision/api/v3/aggTrades?symbol=${pair.binance}&limit=2000`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!resp.ok) return pairAlerts;
          const trades = await resp.json() as Array<{
            a: number; p: string; q: string; T: number; m: boolean;
          }>;
          if (trades.length === 0) return pairAlerts;

          // Group aggregated trades by 1-minute windows
          const minuteBuckets = new Map<number, { totalQty: number; totalUsd: number; buys: number; sells: number }>();
          for (const trade of trades) {
            const qty = parseFloat(trade.q);
            const price = parseFloat(trade.p);
            const usdValue = qty * price;
            const minuteKey = Math.floor(trade.T / 60000);
            const bucket = minuteBuckets.get(minuteKey) ?? { totalQty: 0, totalUsd: 0, buys: 0, sells: 0 };
            bucket.totalQty += qty;
            bucket.totalUsd += usdValue;
            if (trade.m) { bucket.sells += qty; } else { bucket.buys += qty; }
            minuteBuckets.set(minuteKey, bucket);
          }

          // Check each 1-minute bucket for whale-sized activity (>= 10 BTC equiv)
          for (const [minuteKey, bucket] of minuteBuckets) {
            if (bucket.totalUsd < aggThreshold) continue;
            const direction = bucket.buys > bucket.sells ? "in" : "out";
            const tradeKey = `binance_${pair.asset}_min_${minuteKey}`;
            pairAlerts.push({
              asset: pair.asset,
              amount: bucket.totalQty,
              usd_value: bucket.totalUsd,
              direction,
              from_addr: tradeKey,
              to_addr: `agg_${minuteKey}`,
            });
          }

          // Also detect large individual trades (>= 1 BTC equiv)
          for (const trade of trades) {
            const qty = parseFloat(trade.q);
            const price = parseFloat(trade.p);
            const usdValue = qty * price;
            if (usdValue < singleTradeThreshold) continue;
            const tradeKey = `binance_${pair.asset}_single_${trade.a}`;
            pairAlerts.push({
              asset: pair.asset,
              amount: qty,
              usd_value: usdValue,
              direction: trade.m ? "out" : "in",
              from_addr: tradeKey,
              to_addr: `single_${trade.a}`,
            });
          }
        } catch { /* skip pair */ }
        return pairAlerts;
      }));

      for (const result of results) {
        if (result.status === "fulfilled") {
          newAlerts.push(...result.value);
        }
      }
    }

    // Deduplicate by from_addr
    const uniqueAlerts = newAlerts.filter((a, idx, arr) =>
      arr.findIndex((x) => x.from_addr === a.from_addr) === idx
    );

    // Check which already exist in DB before inserting
    if (uniqueAlerts.length > 0) {
      const fromAddrs = uniqueAlerts.map((a) => a.from_addr);
      const { data: existing } = await supabase
        .from("whale_alerts")
        .select("from_addr")
        .in("from_addr", fromAddrs);
      const existingSet = new Set((existing ?? []).map((e: { from_addr: string }) => e.from_addr));
      const toInsert = uniqueAlerts.filter((a) => !existingSet.has(a.from_addr));

      if (toInsert.length > 0) {
        const insertBatchSize = 50;
        for (let i = 0; i < toInsert.length; i += insertBatchSize) {
          const insertBatch = toInsert.slice(i, i + insertBatchSize);
          await supabase.from("whale_alerts").insert(
            insertBatch.map((a) => ({
              asset: a.asset,
              amount: a.amount,
              usd_value: a.usd_value,
              direction: a.direction,
              from_addr: a.from_addr,
              to_addr: a.to_addr,
            }))
          );
        }
      }

      await supabase.from("system_logs").insert({
        level: "success",
        engine_slug: "whale",
        message: `Whale Tracker detected ${toInsert.length} large trades (agg >= 10 BTC equiv / >= ${(aggThreshold / 1000).toFixed(0)}K, single >= 1 BTC equiv / >= ${(singleTradeThreshold / 1000).toFixed(0)}K) across ${PAIRS.length} pairs`,
      });
    } else {
      await supabase.from("system_logs").insert({
        level: "info",
        engine_slug: "whale",
        message: `Whale Tracker ran — no trades >= 10 BTC equiv (${(aggThreshold / 1000).toFixed(0)}K) detected across ${PAIRS.length} pairs`,
      });
    }

    const { data: allAlerts } = await supabase
      .from("whale_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    return new Response(
      JSON.stringify({
        newAlerts: uniqueAlerts.length,
        threshold: `agg >= 10 BTC equiv ($${(aggThreshold / 1000).toFixed(0)}K) | single >= 1 BTC equiv ($${(singleTradeThreshold / 1000).toFixed(0)}K)`,
        pairs: PAIRS.length,
        pairList: PAIRS.map((p) => p.asset),
        alerts: allAlerts ?? [],
      }),
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
