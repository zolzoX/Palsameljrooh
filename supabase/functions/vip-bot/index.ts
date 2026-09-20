import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number; type: string };
    text?: string;
    photo?: Array<{ file_id: string; file_size: number; width: number; height: number }>;
    caption?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    message: { message_id: number; chat: { id: number } };
    data: string;
  };
}

interface BotConfig {
  botToken: string;
  welcomeMessage: string;
  walletTrc20: string;
  walletBep20: string;
  walletErc20: string;
  adminUsername: string;
  adminChatId: string | null;
  botId: string | null;
}

const CHANNEL_LABELS: Record<string, string> = {
  signals: "PALSAMICOS_SIGNALS_VIP",
  meme: "PALSAMICOS_MEME_VIP",
};

const CHANNEL_FEATURES: Record<string, string> = {
  signals: `\u{1F539} <b>VIP Subscription includes:</b>
\u2705 High-Quality Premium Signals
\u2705 Success Rate +82%
\u2705 25+ Signals Daily max
\u2705 Entry \u2013 Targets \u2013 StopLoss \u2013 Leverage`,
  meme: `\u{1F539} <b>VIP Meme Subscription includes:</b>
\u2705 Early Meme Coin Detection
\u2705 Gem Calls Before They Trend
\u2705 15+ Meme Signals Daily
\u2705 Entry \u2013 Targets \u2013 StopLoss
\u2705 DexScreener + Chain Analysis`,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const url = new URL(req.url);
    const botIdParam = url.searchParams.get("bot_id");

    let config: BotConfig;

    if (botIdParam) {
      const { data: botRow } = await supabase.from("telegram_bots")
        .select("sub_bot_token, sub_welcome_message, sub_wallet_trc20, sub_wallet_bep20, sub_wallet_erc20, sub_admin_username, sub_admin_chat_id")
        .eq("id", botIdParam).maybeSingle() as { data: Record<string, unknown> | null };

      if (!botRow || !botRow.sub_bot_token) {
        return new Response(JSON.stringify({ error: "Subscription bot not configured for this VIP channel" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      config = {
        botToken: botRow.sub_bot_token as string,
        welcomeMessage: (botRow.sub_welcome_message as string) ?? "",
        walletTrc20: (botRow.sub_wallet_trc20 as string) ?? "",
        walletBep20: (botRow.sub_wallet_bep20 as string) ?? "",
        walletErc20: (botRow.sub_wallet_erc20 as string) ?? "",
        adminUsername: (botRow.sub_admin_username as string) ?? "@tolerank",
        adminChatId: (botRow.sub_admin_chat_id as string) ?? null,
        botId: botIdParam,
      };
    } else {
      const { data: settingsData } = await supabase.from("vip_settings").select("*").limit(1).maybeSingle();
      const settings = settingsData as Record<string, unknown> | null;
      const botToken = (settings?.vip_bot_token as string) ?? "";

      if (!botToken) {
        return new Response(JSON.stringify({ error: "VIP bot token not configured" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      config = {
        botToken,
        welcomeMessage: (settings?.welcome_message as string) ?? "",
        walletTrc20: (settings?.wallet_trc20 as string) ?? "",
        walletBep20: (settings?.wallet_bep20 as string) ?? "",
        walletErc20: (settings?.wallet_erc20 as string) ?? "",
        adminUsername: (settings?.admin_username as string) ?? "@tolerank",
        adminChatId: (settings?.admin_chat_id as string) ?? null,
        botId: null,
      };
    }

    const tgApi = `https://api.telegram.org/bot${config.botToken}`;
    const body = await req.json() as TelegramUpdate;

    // Handle callback queries (button clicks)
    if (body.callback_query) {
      const cb = body.callback_query;
      const chatId = cb.message.chat.id;
      const userId = String(cb.from.id);
      const username = cb.from.username ?? cb.from.first_name ?? "";
      const data = cb.data ?? "";

      await fetch(`${tgApi}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: cb.id }),
      });

      if (data === "show_channels") {
        await sendChannelSelection(tgApi, chatId, config);
      } else if (data === "show_plans") {
        await sendChannelSelection(tgApi, chatId, config);
      } else if (data.startsWith("channel:")) {
        const channelType = data.slice(8);
        await sendChannelPlans(supabase, tgApi, chatId, channelType, config.botId);
      } else if (data.startsWith("plan:")) {
        const planId = data.slice(5);
        await sendWalletAddresses(supabase, tgApi, chatId, userId, username, planId, config);
      } else if (data === "submit_proof") {
        await sendProofInstructions(tgApi, chatId);
      } else if (data === "mark_paid") {
        await handleMarkAsPaid(supabase, tgApi, chatId, userId, username, config);
      } else if (data === "my_status") {
        await sendUserStatus(supabase, tgApi, chatId, userId);
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Handle regular messages
    if (body.message) {
      const msg = body.message;
      const chatId = msg.chat.id;
      const userId = String(msg.from?.id ?? "");
      const username = msg.from?.username ?? msg.from?.first_name ?? "";
      const text = msg.text ?? "";

      if (text === "/start" || text.toLowerCase().includes("vip") || text.includes("subscribe")) {
        await sendWelcome(supabase, tgApi, chatId, config);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (text === "/plans") {
        await sendChannelSelection(tgApi, chatId, config);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (text === "/status") {
        await sendUserStatus(supabase, tgApi, chatId, userId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (msg.photo && msg.photo.length > 0) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const caption = msg.caption ?? "";
        await handlePaymentProof(supabase, tgApi, chatId, userId, username, fileId, caption, config);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (text.length > 8 && /^[A-Za-z0-9]+$/.test(text)) {
        await handleTxidSubmission(supabase, tgApi, chatId, userId, username, text);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await sendWelcome(supabase, tgApi, chatId, config);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// STEP 1: Welcome with channel selection
async function sendWelcome(supabase: ReturnType<typeof createClient>, tgApi: string, chatId: number, config: BotConfig) {
  const welcomeText = config.welcomeMessage.trim() || `Welcome to Palsamicos VIP Subscriptions!\n\nChoose your VIP channel to get started:`;
  const keyboard = { inline_keyboard: [[{ text: "View Plans & Subscribe", callback_data: "show_channels" }], [{ text: "My Subscription Status", callback_data: "my_status" }]] };
  await sendTelegramMessage(tgApi, chatId, welcomeText, keyboard);
}

// STEP 1b: Channel selection inline keyboard
async function sendChannelSelection(tgApi: string, chatId: number, config: BotConfig) {
  const text = `Please select your preferred VIP channel:\n\nBoth channels offer premium signals with full entry, targets, stop loss, and leverage.`;
  const keyboard = {
    inline_keyboard: [
      [{ text: "\u{1F539} PALSAMICOS_SIGNALS_VIP", callback_data: "channel:signals" }],
      [{ text: "\u{1F539} PALSAMICOS_MEME_VIP", callback_data: "channel:meme" }],
      [{ text: "My Subscription Status", callback_data: "my_status" }],
    ],
  };
  await sendTelegramMessage(tgApi, chatId, text, keyboard);
}

// STEP 1c: Show plans for a specific channel with features
async function sendChannelPlans(supabase: ReturnType<typeof createClient>, tgApi: string, chatId: number, channelType: string, botId: string | null) {
  const { data: plans } = await supabase.from("vip_plans")
    .select("*").eq("is_active", true).eq("bot_id", botId)
    .or(`channel_type.eq.${channelType},channel_type.is.null`)
    .order("sort_order") as { data: Array<Record<string, unknown>> | null };

  const featuresText = CHANNEL_FEATURES[channelType] ?? CHANNEL_FEATURES.signals;
  const channelLabel = CHANNEL_LABELS[channelType] ?? "VIP";

  let planText = `${featuresText}\n\n\u{1F4E6} <b>Available Plans:</b>\n`;

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];

  if (!plans || plans.length === 0) {
    planText += "No plans available yet. Please contact the admin.";
    await sendTelegramMessage(tgApi, chatId, planText, undefined, true);
    return;
  }

  for (const p of plans) {
    const name = p.name as string;
    const price = p.price_usdt as number;
    const duration = p.duration as string;
    let label = `${name} — $${price}`;
    if (duration === "lifetime") label += " (Lifetime)";
    rows.push([{ text: label, callback_data: `plan:${p.id}` }]);
    planText += `\u{1F4CC} ${name} — $${price}\n`;
  }

  rows.push([{ text: "\u2190 Back to Channels", callback_data: "show_channels" }]);

  const keyboard = { inline_keyboard: rows };
  await sendTelegramMessage(tgApi, chatId, planText, keyboard, true);
}

// STEP 2: Show wallet addresses after plan selection
async function sendWalletAddresses(supabase: ReturnType<typeof createClient>, tgApi: string, chatId: number, userId: string, username: string, planId: string, config: BotConfig) {
  const { data: plan } = await supabase.from("vip_plans").select("*").eq("id", planId).maybeSingle() as { data: Record<string, unknown> | null };
  if (!plan) {
    await sendTelegramMessage(tgApi, chatId, "Plan not found. Please try again.");
    return;
  }

  const channelType = (plan.channel_type as string) ?? "signals";
  const channelLabel = CHANNEL_LABELS[channelType] ?? "VIP";

  // Create or update pending subscription with selected channel
  const { data: existing } = await supabase.from("vip_subscriptions")
    .select("*").eq("telegram_user_id", userId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle() as { data: Record<string, unknown> | null };

  if (existing) {
    await supabase.from("vip_subscriptions").update({
      plan_id: planId,
      selected_channel: channelType,
    }).eq("id", existing.id as string);
  } else {
    await supabase.from("vip_subscriptions").insert({
      telegram_user_id: userId,
      telegram_username: username,
      plan_id: planId,
      selected_channel: channelType,
      status: "pending",
    });
  }

  const text = `You selected: <b>${plan.name}</b> — $${plan.price_usdt}\nChannel: ${channelLabel}\n\n\u{1F7E1} <b>USDT (TRC20):</b>\n<code>${config.walletTrc20 || "Not configured"}</code>\n\n\u{1F7E1} <b>USDT (BEP20 - BSC):</b>\n<code>${config.walletBep20 || "Not configured"}</code>\n\n\u{1F7E1} <b>USDT (ERC20):</b>\n<code>${config.walletErc20 || "Not configured"}</code>\n\nAfter sending payment, click the button below to notify the admin.`;
  const keyboard = {
    inline_keyboard: [
      [{ text: "\u2705 Mark as Paid", callback_data: "mark_paid" }],
      [{ text: "\u2190 Back to Plans", callback_data: `channel:${channelType}` }],
    ],
  };
  await sendTelegramMessage(tgApi, chatId, text, keyboard, true);
}

// STEP 3: Handle "Mark as Paid" — notify admin + confirm to user
async function handleMarkAsPaid(supabase: ReturnType<typeof createClient>, tgApi: string, chatId: number, userId: string, username: string, config: BotConfig) {
  const { data: sub } = await supabase.from("vip_subscriptions")
    .select("*, vip_plans(name, price_usdt, channel_type)")
    .eq("telegram_user_id", userId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle() as { data: Record<string, unknown> | null };

  let planName = "Unknown Plan";
  let planPrice = "";
  let channelLabel = "VIP";

  if (sub) {
    const planData = sub.vip_plans as Record<string, unknown> | null;
    planName = (planData?.name as string) ?? "Unknown Plan";
    planPrice = planData?.price_usdt != null ? `$${planData.price_usdt}` : "";
    const channelType = (sub.selected_channel as string) ?? (planData?.channel_type as string) ?? "signals";
    channelLabel = CHANNEL_LABELS[channelType] ?? "VIP";
    await supabase.from("vip_subscriptions").update({ status: "submitted" }).eq("id", sub.id as string);
  }

  // Notify admin
  const adminText = `\u{1F4E3} <b>NEW PAYMENT SUBMISSION</b>\n\n<b>User:</b> @${username}\n<b>User ID:</b> ${userId}\n<b>Channel:</b> ${channelLabel}\n<b>Plan:</b> ${planName} ${planPrice}\n\nPlease verify the transaction and grant access.`;

  // Try to send to admin chat ID if configured
  if (config.adminChatId) {
    await sendTelegramMessage(tgApi, Number(config.adminChatId), adminText, undefined, true);
  } else {
    // Try to notify via the admin username (send to the bot's own chat with the admin)
    // Fallback: log it so admin can check in the dashboard
    await supabase.from("system_logs").insert({
      level: "info",
      engine_slug: "vip",
      message: `Payment submission: @${username} (ID: ${userId}) — ${channelLabel} — ${planName} ${planPrice}. Admin: ${config.adminUsername}`,
    });
  }

  // Confirm to user
  const userText = `Your payment has been submitted. An admin (${config.adminUsername}) will verify your transaction and grant you access shortly.\n\nYou will receive your VIP channel invite link here once verified.`;
  const keyboard = {
    inline_keyboard: [
      [{ text: "Send Payment Screenshot", callback_data: "submit_proof" }],
      [{ text: "My Subscription Status", callback_data: "my_status" }],
    ],
  };
  await sendTelegramMessage(tgApi, chatId, userText, keyboard);
}

async function sendProofInstructions(tgApi: string, chatId: number) {
  const text = "Please submit your payment proof:\n\n1. Send your TXID (transaction hash) as a text message\n2. Send a screenshot of the payment confirmation\n\nOur admin will verify and send you the VIP channel invite link.";
  await sendTelegramMessage(tgApi, chatId, text);
}

async function handlePaymentProof(supabase: ReturnType<typeof createClient>, tgApi: string, chatId: number, userId: string, username: string, fileId: string, caption: string, config: BotConfig) {
  const { data: sub } = await supabase.from("vip_subscriptions")
    .select("*").eq("telegram_user_id", userId).eq("status", "pending")
    .or("status.eq.submitted")
    .order("created_at", { ascending: false }).limit(1).maybeSingle() as { data: Record<string, unknown> | null };

  if (sub) {
    await supabase.from("vip_subscriptions").update({
      screenshot_url: fileId,
      txid: caption || sub.txid,
    }).eq("id", sub.id as string);
  } else {
    await supabase.from("vip_subscriptions").insert({
      telegram_user_id: userId,
      telegram_username: username,
      status: "pending",
      screenshot_url: fileId,
      txid: caption || null,
    });
  }

  const text = `Payment proof received! Our admin (${config.adminUsername}) will verify your payment shortly.\n\nYou will receive your VIP channel invite link here once verified.`;
  await sendTelegramMessage(tgApi, chatId, text);
}

async function handleTxidSubmission(supabase: ReturnType<typeof createClient>, tgApi: string, chatId: number, userId: string, username: string, txid: string) {
  const { data: sub } = await supabase.from("vip_subscriptions")
    .select("*").eq("telegram_user_id", userId)
    .in("status", ["pending", "submitted"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle() as { data: Record<string, unknown> | null };

  if (sub) {
    await supabase.from("vip_subscriptions").update({ txid }).eq("id", sub.id as string);
  } else {
    await supabase.from("vip_subscriptions").insert({
      telegram_user_id: userId,
      telegram_username: username,
      status: "pending",
      txid,
    });
  }

  await sendTelegramMessage(tgApi, chatId, "TXID received. Please also send a screenshot of your payment confirmation for verification.");
}

async function sendUserStatus(supabase: ReturnType<typeof createClient>, tgApi: string, chatId: number, userId: string) {
  const { data: subs } = await supabase.from("vip_subscriptions")
    .select("*, vip_plans(name)").eq("telegram_user_id", userId)
    .order("created_at", { ascending: false }).limit(5) as { data: Array<Record<string, unknown>> | null };

  if (!subs || subs.length === 0) {
    await sendTelegramMessage(tgApi, chatId, "You have no subscriptions yet. Use /start to view plans.");
    return;
  }

  let text = "Your recent subscriptions:\n\n";
  for (const s of subs) {
    const planName = (s.vip_plans as Record<string, unknown>)?.name ?? "Unknown";
    const status = s.status as string;
    const channel = s.selected_channel as string ?? "signals";
    const channelLabel = CHANNEL_LABELS[channel] ?? "VIP";
    const statusText = status.toUpperCase();
    text += `${statusText} ${planName} \u2014 ${channelLabel} \u2014 ${status}\n`;
    if (s.invite_link && status === "paid") {
      text += `   VIP Link: ${s.invite_link}\n`;
    }
    text += "\n";
  }
  await sendTelegramMessage(tgApi, chatId, text);
}

async function sendTelegramMessage(tgApi: string, chatId: number, text: string, keyboard?: Record<string, unknown>, useHtml = false) {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (useHtml) body.parse_mode = "HTML";
  if (keyboard) body.reply_markup = keyboard;
  await fetch(`${tgApi}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}
