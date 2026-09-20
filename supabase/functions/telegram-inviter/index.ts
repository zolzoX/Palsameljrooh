import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Safety constants
const MIN_DELAY_MS = 5000;   // 5 seconds minimum between invites
const MAX_DELAY_MS = 12000;  // 12 seconds maximum (randomized in this range)
const BATCH_SIZE = 20;       // Process in batches of 20
const BATCH_PAUSE_MS = 30000; // 30-second pause between batches
const FLOOD_WAIT_CAP_S = 3600; // Never wait longer than 1 hour for a flood wait
const MAX_RETRIES = 3;

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

interface FloodWaitResult {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
  floodWaitSeconds?: number;
}

async function safeTelegramCall(
  token: string, method: string, body: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>, jobId: string
): Promise<FloodWaitResult> {
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    const data = await telegramApiCall(token, method, body);

    if (data.ok) return { ...data, floodWaitSeconds: 0 };

    // Check for FloodWait (HTTP 429 or "Too Many Requests" or "retry after N")
    if (data.error_code === 429 || (data.description && data.description.toLowerCase().includes("too many requests"))) {
      const waitSeconds = parseFloodWaitSeconds(data.description ?? "") ?? 30;
      await supabase.from("system_logs").insert({
        level: "warning", engine_slug: "telegram",
        message: `FloodWait on ${method} (job ${jobId}) — pausing ${waitSeconds}s (attempt ${attempts + 1}/${MAX_RETRIES})`,
      });
      // Pause for the required cooldown + 2s buffer
      await new Promise((resolve) => setTimeout(resolve, (waitSeconds + 2) * 1000));
      attempts++;
      continue;
    }

    // Non-retryable error
    return data;
  }

  return { ok: false, description: `Max retries (${MAX_RETRIES}) exceeded for ${method}` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { jobId } = body as { jobId: string };

    if (!jobId) {
      return new Response(JSON.stringify({ error: "Job ID is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: job } = await supabase.from("invite_jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("invite_jobs").update({ status: "running" }).eq("id", jobId);

    const { data: bot } = await supabase.from("telegram_bots").select("bot_token, name").eq("id", job.target_bot_id).maybeSingle();
    if (!bot || !bot.bot_token) {
      await supabase.from("invite_jobs").update({ status: "failed" }).eq("id", jobId);
      return new Response(JSON.stringify({ error: "Target bot not found or no token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch pending job items
    const { data: items } = await supabase.from("invite_job_items").select("*").eq("job_id", jobId).eq("status", "pending").order("id");
    const pendingItems = (items ?? []) as Array<{ id: string; member_user_id: string; member_username: string }>;

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let rateLimited = 0;

    // Generate a single invite link upfront (reusable, not per-user)
    let inviteLink = "";
    const linkResult = await safeTelegramCall(bot.bot_token, "exportChatInviteLink", { chat_id: job.target_channel_username }, supabase, jobId);
    if (linkResult.ok) {
      inviteLink = linkResult.result as string;
    } else {
      const createResult = await safeTelegramCall(bot.bot_token, "createChatInviteLink", {
        chat_id: job.target_channel_username, expire_date: Math.floor(Date.now() / 1000) + 86400,
      }, supabase, jobId);
      if (createResult.ok) inviteLink = (createResult.result as Record<string, string>).invite_link ?? "";
    }
    if (!inviteLink) inviteLink = `https://t.me/${job.target_channel_username.replace("@", "")}`;

    // Initial delay before starting the first invite
    await randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);

    // Process in batches
    for (let batchStart = 0; batchStart < pendingItems.length; batchStart += BATCH_SIZE) {
      const batch = pendingItems.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(pendingItems.length / BATCH_SIZE);

      await supabase.from("system_logs").insert({
        level: "info", engine_slug: "telegram",
        message: `Invite job ${jobId} — batch ${batchNum}/${totalBatches} starting (${batch.length} users)`,
      });

      for (const item of batch) {
        try {
          const msgText = `You've been invited to join ${job.target_channel_username}!\n\nJoin here: ${inviteLink}`;
          const sendResult = await safeTelegramCall(bot.bot_token, "sendMessage", {
            chat_id: item.member_user_id || `@${item.member_username}`,
            text: msgText,
            reply_markup: { inline_keyboard: [[{ text: "Join Channel", url: inviteLink }]] },
          }, supabase, jobId);

          if (sendResult.ok) {
            succeeded++;
            await supabase.from("invite_job_items").update({
              status: "success", processed_at: new Date().toISOString(),
            }).eq("id", item.id);
          } else {
            const errorMsg = sendResult.description ?? "Unknown error";
            if (sendResult.error_code === 429 || errorMsg.toLowerCase().includes("too many requests")) {
              rateLimited++;
              const waitSeconds = parseFloodWaitSeconds(errorMsg) ?? 30;
              await supabase.from("invite_job_items").update({
                status: "rate_limited", error_message: `FloodWait ${waitSeconds}s — ${errorMsg}`, processed_at: new Date().toISOString(),
              }).eq("id", item.id);
              // Extra cooldown after rate limiting
              await new Promise((resolve) => setTimeout(resolve, (waitSeconds + 5) * 1000));
            } else {
              failed++;
              await supabase.from("invite_job_items").update({
                status: "failed", error_message: errorMsg, processed_at: new Date().toISOString(),
              }).eq("id", item.id);
            }
          }

          processed++;
          await supabase.from("invite_jobs").update({ processed, succeeded, failed, rate_limited }).eq("id", jobId);

          // Randomized delay between each invite
          await randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
        } catch (err) {
          failed++;
          processed++;
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          await supabase.from("invite_job_items").update({
            status: "failed", error_message: errMsg, processed_at: new Date().toISOString(),
          }).eq("id", item.id);
          await supabase.from("invite_jobs").update({ processed, succeeded, failed, rate_limited }).eq("id", jobId);
          await randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
        }
      }

      // Pause between batches (except after the last one)
      if (batchStart + BATCH_SIZE < pendingItems.length) {
        await supabase.from("system_logs").insert({
          level: "info", engine_slug: "telegram",
          message: `Invite job ${jobId} — batch ${batchNum} done, pausing ${BATCH_PAUSE_MS / 1000}s before next batch`,
        });
        await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
      }
    }

    await supabase.from("invite_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", jobId);

    await supabase.from("system_logs").insert({
      level: "success", engine_slug: "telegram",
      message: `Invite job completed safely — Processed: ${processed}, Success: ${succeeded}, Failed: ${failed}, Rate Limited: ${rateLimited}. Batches: ${Math.ceil(pendingItems.length / BATCH_SIZE)}, delays: ${MIN_DELAY_MS}-${MAX_DELAY_MS}ms.`,
    });

    return new Response(JSON.stringify({ jobId, processed, succeeded, failed, rateLimited, status: "completed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
