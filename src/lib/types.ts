export interface BotEngine {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  health: string;
  signals_today: number;
  last_signal_at: string | null;
  created_at: string;
}

export interface TelegramBot {
  id: string;
  name: string;
  bot_token: string;
  chat_id: string;
  is_active: boolean;
  is_connected: boolean;
  channel_type: "free" | "vip";
  bot_role: "signal" | "free_signal" | "vip_signal" | "vip_subscription";
  linked_vip_bot_id: string | null;
  sub_bot_token: string | null;
  sub_bot_username: string | null;
  sub_welcome_message: string | null;
  sub_wallet_trc20: string | null;
  sub_wallet_bep20: string | null;
  sub_wallet_erc20: string | null;
  sub_admin_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface BotEngineRoute {
  id: string;
  bot_id: string;
  engine_slug: string;
  is_allowed: boolean;
  created_at: string;
}

export interface SignalConfig {
  id: string;
  timeframe: string;
  rsi_oversold: number;
  rsi_overbought: number;
  ema_fast_period: number;
  ema_slow_period: number;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  bb_period: number;
  bb_std_dev: number;
  is_active: boolean;
  created_at: string;
}

export interface TelegramConfig {
  id: string;
  bot_token: string | null;
  chat_id: string | null;
  is_connected: boolean;
  updated_at: string;
}

export interface Channel {
  id: string;
  name: string;
  chat_id: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface EngineChannel {
  id: string;
  engine_slug: string;
  channel_id: string;
  is_allowed: boolean;
  created_at: string;
}

export type SignalStatus = "sent" | "pending" | "failed";
export type Sentiment = "bullish" | "bearish" | "neutral";
export type Timeframe = "5m" | "15m" | "30m" | "1h" | "4h";

export interface Signal {
  id: string;
  engine_slug: string;
  title: string;
  message: string | null;
  status: SignalStatus;
  source_url: string | null;
  pair: string | null;
  sentiment: Sentiment | null;
  timeframe: string | null;
  indicators: string[] | null;
  bot_id: string | null;
  is_vip: boolean | null;
  entry_price: number | null;
  tp1_price: number | null;
  tp2_price: number | null;
  tp3_price: number | null;
  stop_loss_price: number | null;
  tp1_hit: boolean | null;
  tp2_hit: boolean | null;
  tp3_hit: boolean | null;
  created_at: string;
}

export type LogLevel = "info" | "success" | "warning" | "error";

export interface SystemLog {
  id: string;
  level: LogLevel;
  engine_slug: string | null;
  message: string;
  created_at: string;
}

export interface WhaleAlert {
  id: string;
  asset: string;
  amount: number;
  usd_value: number;
  direction: string;
  from_addr: string | null;
  to_addr: string | null;
  created_at: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string | null;
  url: string | null;
  sentiment: Sentiment;
  keywords: string[] | null;
  published_at: string;
  created_at: string;
}

export interface ScalpingPair {
  id: string;
  symbol: string;
  name: string;
  price: number;
  price_change_24h: number;
  rsi: number;
  ema_fast: number;
  ema_slow: number;
  macd_line: number;
  macd_signal: number;
  macd_histogram: number;
  bb_upper: number;
  bb_middle: number;
  bb_lower: number;
  trend: string;
  volume: number;
  updated_at: string;
}

export interface MemeToken {
  id: string;
  symbol: string;
  name: string;
  price: number;
  price_change_24h: number;
  liquidity: number;
  volume_24h: number;
  chain: string;
  dex_url: string | null;
  fetched_at: string;
  price_change_5m?: number;
  price_change_1h?: number;
  price_change_6h?: number;
  volume_6h?: number;
  volume_1h?: number;
  txns_24h?: number;
  txns_buys_24h?: number;
  txns_sells_24h?: number;
  txns_buys_1h?: number;
  txns_sells_1h?: number;
  buy_sell_ratio?: number;
  holder_count?: number;
  fdv?: number;
  market_cap?: number;
  token_address?: string;
  pair_address?: string;
  dex_id?: string;
  momentum?: string;
  caution?: string;
  risk_level?: string;
  source?: string;
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface TimeframeData {
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

export interface LivePair {
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

export interface LiveWhaleAlert {
  id: string;
  asset: string;
  amount: number;
  usd_value: number;
  direction: string;
  from_addr: string | null;
  to_addr: string | null;
  created_at: string;
}

export const ENGINE_META: Record<string, { label: string; color: string; icon: string }> = {
  scalping: { label: "Scalping", color: "cyan", icon: "Activity" },
  meme: { label: "Meme Radar", color: "pink", icon: "Rocket" },
  whale: { label: "Whale Tracker", color: "blue", icon: "Waves" },
  news: { label: "News", color: "amber", icon: "Newspaper" },
};

export const TIMEFRAMES: Array<{ id: Timeframe; label: string }> = [
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "30m", label: "30m" },
  { id: "1h", label: "1h" },
  { id: "4h", label: "4h" },
];

export interface VipSettings {
  id: string;
  vip_bot_token: string | null;
  vip_channel_id: string | null;
  vip_subscribe_url: string | null;
  admin_username: string;
  wallet_trc20: string | null;
  wallet_bep20: string | null;
  wallet_erc20: string | null;
  welcome_message: string | null;
  free_signal_counter: number;
  updated_at: string;
}

export interface VipPlan {
  id: string;
  name: string;
  duration: string;
  price_usdt: number;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  bot_id: string | null;
  created_at: string;
}

export interface VipSubscription {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  plan_id: string | null;
  status: "pending" | "paid" | "rejected" | "expired";
  txid: string | null;
  screenshot_url: string | null;
  invite_link: string | null;
  admin_notes: string | null;
  created_at: string;
  verified_at: string | null;
  expires_at: string | null;
}
