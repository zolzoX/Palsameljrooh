import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BULLISH = ["surge", "rally", "breakout", "bullish", "soar", "gain", "pump", "adopt", "approve", "etf", "inflow", "record", "high", "up", "rise", "boom", "bull", "buy", "positive", "growth", "support", "upgrade", "outperform", "soars", "jump", "rises", "climb", "soared", "surged", "rallied", "rallying"];
const BEARISH = ["crash", "plunge", "bearish", "dump", "hack", "exploit", "sec", "lawsuit", "ban", "regulation", "sell-off", "fear", "decline", "low", "down", "fall", "bear", "fraud", "scam", "sell", "negative", "drop", "warn", "risk", "outflow", "downgrade", "tumble", "slump", "dive", "plunged", "crashed", "dumped", "slammed"];

interface FeedItem { title: string; link: string; pubDate: string; source: string; description?: string; }

function analyzeSentiment(title: string): { sentiment: string; keywords: string[] } {
  const lower = title.toLowerCase();
  const words = lower.split(/\W+/);
  const keywords: string[] = [];
  let bull = 0, bear = 0;
  for (const w of words) {
    if (BULLISH.includes(w)) { bull++; if (!keywords.includes(w)) keywords.push(w); }
    if (BEARISH.includes(w)) { bear++; if (!keywords.includes(w)) keywords.push(w); }
  }
  let sentiment = "neutral";
  if (bull > bear) sentiment = "bullish";
  else if (bear > bull) sentiment = "bearish";
  return { sentiment, keywords };
}

function extractCDATA(content: string, tagName: string): string | null {
  const cdataRegex = new RegExp(`<${tagName}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tagName}>`, "i");
  const plainRegex = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*</${tagName}>`, "i");
  const cdataMatch = content.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();
  const plainMatch = content.match(plainRegex);
  if (plainMatch) return plainMatch[1].trim();
  return null;
}

function parseRSS(xml: string, source: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
    const block = match[0];
    const title = extractCDATA(block, "title");
    const link = extractCDATA(block, "link");
    const pubDate = extractCDATA(block, "pubDate") || extractCDATA(block, "published");
    const desc = extractCDATA(block, "description");
    if (title) {
      items.push({
        title,
        link: link || "",
        pubDate: pubDate || new Date().toUTCString(),
        source,
        description: desc ? desc.replace(/<[^>]*>/g, "").slice(0, 200) : undefined,
      });
    }
  }

  if (items.length === 0) {
    const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null && items.length < 20) {
      const block = match[0];
      const title = extractCDATA(block, "title");
      const linkMatch = block.match(/<link[^>]*href="([^"]*)"[^>]*>/i);
      const pubDate = extractCDATA(block, "published") || extractCDATA(block, "updated");
      const desc = extractCDATA(block, "summary") || extractCDATA(block, "content");
      if (title) {
        items.push({
          title,
          link: linkMatch ? linkMatch[1] : "",
          pubDate: pubDate || new Date().toUTCString(),
          source,
          description: desc ? desc.replace(/<[^>]*>/g, "").slice(0, 200) : undefined,
        });
      }
    }
  }
  return items;
}

async function fetchFeed(url: string, source: string): Promise<{ items: FeedItem[]; ok: boolean; error?: string }> {
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "application/xml, text/xml, application/rss+xml, application/atom+xml, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!resp.ok) return { items: [], ok: false, error: `HTTP ${resp.status}` };
    const xml = await resp.text();
    const items = parseRSS(xml, source);
    return { items, ok: items.length > 0 };
  } catch (err) {
    return { items: [], ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

async function fetchCryptoCompareNews(): Promise<FeedItem[]> {
  try {
    const resp = await fetch("https://min-api.cryptocompare.com/data/v2/news/?lang=EN", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { Data?: Array<{ title?: string; url?: string; source?: string; body?: string; published_on?: number }> };
    return (data.Data ?? []).slice(0, 30).map((a) => ({
      title: a.title ?? "",
      link: a.url ?? "",
      pubDate: a.published_on ? new Date(a.published_on * 1000).toUTCString() : new Date().toUTCString(),
      source: a.source ?? "CryptoCompare",
      description: a.body?.slice(0, 200),
    }));
  } catch {
    return [];
  }
}

async function fetchCoinGeckoNews(): Promise<FeedItem[]> {
  try {
    const resp = await fetch("https://api.coingecko.com/api/v3/news", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { data?: Array<{ title?: string; url?: string; author?: string; updated_at?: string }> };
    return (data.data ?? []).slice(0, 20).map((a) => ({
      title: a.title ?? "",
      link: a.url ?? "",
      pubDate: a.updated_at ? new Date(a.updated_at).toUTCString() : new Date().toUTCString(),
      source: a.author ?? "CoinGecko",
      description: undefined,
    }));
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const feeds: Array<{ url: string; source: string }> = [
      { url: "https://cointelegraph.com/rss", source: "CoinTelegraph" },
      { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
      { url: "https://decrypt.co/feed", source: "Decrypt" },
      { url: "https://cointelegraph.com/rss/category/market-analysis", source: "CoinTelegraph" },
      { url: "https://cointelegraph.com/rss/category/bitcoin", source: "CoinTelegraph" },
      { url: "https://www.theblock.co/rss.xml", source: "The Block" },
      { url: "https://cryptoslate.com/feed/", source: "CryptoSlate" },
      { url: "https://bitcoinist.com/feed/", source: "Bitcoinist" },
      { url: "https://news.bitcoin.com/feed/", source: "Bitcoin.com" },
      { url: "https://cryptobriefing.com/feed/", source: "CryptoBriefing" },
      { url: "https://thedefiant.io/feed", source: "The Defiant" },
      { url: "https://blockworks.co/feed", source: "Blockworks" },
      { url: "https://www.crypto-news.net/feed/", source: "CryptoNews" },
      { url: "https://cryptonews.com/news/feed/", source: "CryptoNews.com" },
      { url: "https://u.today/rss", source: "U.Today" },
      { url: "https://www.newsbtc.com/feed/", source: "NewsBTC" },
      { url: "https://cryptopotato.com/feed/", source: "CryptoPotato" },
      { url: "https://beincrypto.com/feed/", source: "BeInCrypto" },
      { url: "https://coinquora.com/feed/", source: "CoinQuora" },
      { url: "https://zycrypto.com/feed/", source: "ZyCrypto" },
    ];

    let allItems: FeedItem[] = [];
    const fetchedSources: string[] = [];
    const feedErrors: string[] = [];

    // Fetch all feeds in parallel for speed
    const feedResults = await Promise.allSettled(
      feeds.map((f) => fetchFeed(f.url, f.source))
    );

    for (let i = 0; i < feedResults.length; i++) {
      const result = feedResults[i];
      const feed = feeds[i];
      if (result.status === "fulfilled") {
        if (result.value.ok && result.value.items.length > 0) {
          allItems = allItems.concat(result.value.items);
          if (!fetchedSources.includes(feed.source)) fetchedSources.push(feed.source);
        } else if (result.value.error) {
          feedErrors.push(`${feed.source}: ${result.value.error}`);
        }
      } else {
        feedErrors.push(`${feed.source}: rejected`);
      }
    }

    // Fallback: CryptoCompare API (always available)
    const ccNews = await fetchCryptoCompareNews();
    if (ccNews.length > 0) {
      allItems = allItems.concat(ccNews);
      if (!fetchedSources.includes("CryptoCompare")) fetchedSources.push("CryptoCompare");
    }

    // Fallback: CoinGecko news API
    const cgNews = await fetchCoinGeckoNews();
    if (cgNews.length > 0) {
      allItems = allItems.concat(cgNews);
      if (!fetchedSources.includes("CoinGecko")) fetchedSources.push("CoinGecko");
    }

    // Sort by date descending
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // Deduplicate by title
    const seenTitles = new Set<string>();
    allItems = allItems.filter((item) => {
      const key = item.title.toLowerCase().trim();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });

    if (allItems.length === 0) {
      await supabase.from("system_logs").insert({
        level: "warning", engine_slug: "news",
        message: `News Desk: All feeds failed — ${feedErrors.join("; ")}. Using cached data.`,
      });
      const { data: cached } = await supabase.from("news_items").select("*").order("published_at", { ascending: false }).limit(50);
      return new Response(JSON.stringify({
        count: cached?.length ?? 0, new: 0, sent: 0, sources: [], errors: feedErrors,
        items: cached ?? [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Analyze up to 100 articles (was 40)
    const analyzed = allItems.slice(0, 100).map((item) => {
      const { sentiment, keywords } = analyzeSentiment(item.title);
      return {
        title: item.title, source: item.source, url: item.link,
        sentiment, keywords, published_at: new Date(item.pubDate).toISOString(),
      };
    });

    // Dedup against DB: only insert new articles
    const recentSince = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: existingNews } = await supabase.from("news_items").select("title").gte("published_at", recentSince);
    const existingTitles = new Set((existingNews ?? []).map((n: { title: string }) => n.title));
    const newArticles = analyzed.filter((a) => !existingTitles.has(a.title));

    // Delete articles older than 48 hours instead of wiping everything
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await supabase.from("news_items").delete().lt("published_at", cutoff);

    // Insert only new articles (preserves existing ones)
    if (newArticles.length > 0) await supabase.from("news_items").insert(newArticles);

    const bullCount = analyzed.filter((a) => a.sentiment === "bullish").length;
    const bearCount = analyzed.filter((a) => a.sentiment === "bearish").length;
    const neutralCount = analyzed.filter((a) => a.sentiment === "neutral").length;

    await supabase.from("system_logs").insert({
      level: "success", engine_slug: "news",
      message: `News refreshed — ${analyzed.length} articles from ${fetchedSources.join(", ")} | New: ${newArticles.length} | Bull: ${bullCount} Bear: ${bearCount} Neutral: ${neutralCount}${feedErrors.length > 0 ? ` | Failed feeds: ${feedErrors.length}` : ""}`,
    });

    return new Response(JSON.stringify({
      count: analyzed.length, new: newArticles.length, sent: 0,
      sources: fetchedSources, errors: feedErrors,
      bullish: bullCount, bearish: bearCount, neutral: neutralCount,
      items: analyzed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
