import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Safety constants
const MIN_DELAY_MS = 3000;
const MAX_DELAY_MS = 8000;
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 15000;
const FLOOD_WAIT_CAP_S = 3600;

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseFloodWaitSeconds(description: string): number | null {
  const match = description.match(/retry after (\d+)/i);
  if (match) {
    const seconds = parseInt(match[1], 10);
    return Math.min(seconds, FLOOD_WAIT_CAP_S);
  }
  return null;
}

async function telegramApiCall(token: string, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; description?: string; error_code?: number }> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    return data as { ok: boolean; result?: unknown; description?: string; error_code?: number };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "Network error" };
  }
}

async function safeTelegramCall(
  token: string, method: string, body: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>, logChannel: string
): Promise<{ ok: boolean; result?: unknown; description?: string; error_code?: number; floodWaited?: number }> {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const data = await telegramApiCall(token, method, body);

    if (data.ok) return data;

    // Check for FloodWait (error 429)
    if (data.error_code === 429 || (data.description && data.description.toLowerCase().includes("too many requests"))) {
      const waitSeconds = parseFloodWaitSeconds(data.description ?? "") ?? 30;
      await supabase.from("system_logs").insert({
        level: "warning", engine_slug: "telegram",
        message: `FloodWait on ${method} for @${logChannel} — pausing ${waitSeconds}s (attempt ${attempts + 1}/${maxAttempts})`,
      });
      await new Promise((resolve) => setTimeout(resolve, (waitSeconds + 2) * 1000));
      attempts++;
      continue;
    }

    // Non-retryable error
    return data;
  }

  return { ok: false, description: `Max retries (${maxAttempts}) exceeded for ${method}` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { channelUsername, botToken } = body as { channelUsername: string; botToken?: string };

    if (!channelUsername) {
      return new Response(JSON.stringify({ error: "Channel username is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cleanUsername = channelUsername.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "").replace(/^\//, "");

    let token = botToken;
    if (!token) {
      const { data: botData } = await supabase.from("telegram_bots").select("bot_token").eq("is_active", true).eq("is_connected", true).limit(1).maybeSingle();
      token = botData?.bot_token;
    }
    if (!token) {
      return new Response(JSON.stringify({ error: "No Telegram bot token available. Configure a bot in Telegram Manager first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. Fetch channel info (with FloodWait handling)
    const chatResult = await safeTelegramCall(token, "getChat", { chat_id: `@${cleanUsername}` }, supabase, cleanUsername);
    if (!chatResult.ok) {
      return new Response(JSON.stringify({ error: `Cannot access channel @${cleanUsername}. ${chatResult.description ?? "Bot must be a member."}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const channelInfo = chatResult.result as Record<string, unknown>;
    const chatId = channelInfo.id as string | number;

    // Randomized delay between API calls
    await randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);

    // 2. Get member count
    let memberCount = 0;
    const countResult = await safeTelegramCall(token, "getChatMemberCount", { chat_id: chatId }, supabase, cleanUsername);
    if (countResult.ok) memberCount = countResult.result as number;

    await randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);

    // 3. Get chat administrators
    const members: Array<{ user_id: string; username: string; first_name: string; last_name: string; is_bot: boolean }> = [];
    const adminsResult = await safeTelegramCall(token, "getChatAdministrators", { chat_id: chatId }, supabase, cleanUsername);
    if (adminsResult.ok) {
      const adminList = adminsResult.result as Array<Record<string, unknown>>;
      for (const admin of adminList) {
        const user = admin.user as Record<string, unknown>;
        members.push({
          user_id: String(user.id ?? ""),
          username: (user.username as string) ?? "",
          first_name: (user.first_name as string) ?? "",
          last_name: (user.last_name as string) ?? "",
          is_bot: (user.is_bot as boolean) ?? false,
        });
        // Micro-delay between processing each admin record
        await randomDelay(500, 1500);
      }
    }

    // 4. MTProto session check (for full member scraping)
    const sessionString = Deno.env.get("TELEGRAM_SESSION_STRING");
    if (sessionString) {
      await supabase.from("system_logs").insert({
        level: "info", engine_slug: "telegram",
        message: `MTProto session detected for @${cleanUsername} — full member scraping requires GramJS runtime. Bot API data: ${members.length} admins, ${memberCount} total members.`,
      });
    }

    // 5. Save to DB (upsert)
    const { data: existingChannel } = await supabase.from("telegram_channels").select("*").eq("channel_username", cleanUsername).maybeSingle();

    let channelId: string;

    if (existingChannel) {
      await supabase.from("telegram_channels").update({
        channel_id: String(chatId), title: (channelInfo.title as string) ?? cleanUsername,
        member_count: memberCount, status: "scraped",
      }).eq("id", existingChannel.id);
      channelId = existingChannel.id;

      await supabase.from("channel_members").delete().eq("channel_id", channelId);
    } else {
      const { data: newChannel } = await supabase.from("telegram_channels").insert({
        channel_username: cleanUsername, channel_id: String(chatId),
        title: (channelInfo.title as string) ?? cleanUsername, member_count: memberCount, status: "scraped",
      }).select("*").maybeSingle();
      channelId = newChannel?.id ?? "";
    }

    // Insert members in small batches
    if (members.length > 0 && channelId) {
      for (let i = 0; i < members.length; i += BATCH_SIZE) {
        const batch = members.slice(i, i + BATCH_SIZE);
        await supabase.from("channel_members").insert(batch.map((m) => ({
          channel_id: channelId, user_id: m.user_id, username: m.username,
          first_name: m.first_name, last_name: m.last_name, is_bot: m.is_bot,
        })));
        if (i + BATCH_SIZE < members.length) await randomDelay(1000, 3000);
      }
    }

    await supabase.from("system_logs").insert({
      level: "success", engine_slug: "telegram",
      message: `Channel @${cleanUsername} scraped safely — ${memberCount} total members, ${members.length} fetched. Delays: ${MIN_DELAY_MS}-${MAX_DELAY_MS}ms between calls.`,
    });

    return new Response(JSON.stringify({
      channel: { id: channelId, channel_username: cleanUsername, member_count: memberCount, title: (channelInfo.title as string) ?? cleanUsername, status: "scraped" },
      memberCount, fetchedCount: members.length, members,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
