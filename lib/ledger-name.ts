/**
 * ratcount · 注册默认账本名生成器（纯函数，可单测）
 *  - 按界面语言取意境词 + 后缀 + 4 位随机数字，保证随机、每次唯一且不超 30 字
 *  - 与 app/register/actions.ts 的注册自动建账本逻辑同源
 * ratcount · default ledger-name generator for registration (pure fn, testable)
 *  - Per UI locale: a mood word + suffix + 4 random digits; random, unique per call, ≤30 chars
 *  - Shares logic with app/register/actions.ts auto-create-ledger path
 */

import { DEFAULT_LOCALE } from "@/i18n/routing";

export const LEDGER_NAME_WORDS: Record<string, string[]> = {
  "zh-CN": ["日常", "家庭", "旅行", "梦想", "月光", "晨曦", "星河", "时光", "随心", "小金库", "柴米", "四季", "清风", "远山", "归途", "拾光"],
  "zh-TW": ["日常", "家庭", "旅行", "夢想", "月光", "晨曦", "星河", "時光", "隨心", "小金庫", "柴米", "四季", "清風", "遠山", "歸途", "拾光"],
  en: ["Daily", "Home", "Travel", "Dream", "Moonlight", "Dawn", "Galaxy", "Time", "Free", "Piggy", "Season", "Breeze", "Horizon", "Journey", "Moments"],
};

/** 各语言后缀；英文带前导空格以分隔单词，中文/繁体无空格 / Per-locale suffix; English has a leading space to separate words; zh/zh-TW have none */
export const LEDGER_NAME_SUFFIX: Record<string, string> = {
  "zh-CN": "账本",
  "zh-TW": "帳本",
  en: " Ledger",
};

/** 生成随机默认账本名；locale 非法/缺失时回退 zh-CN / Build a random default ledger name; falls back to zh-CN when locale is invalid/missing */
export function randomLedgerName(locale: string): string {
  const words = LEDGER_NAME_WORDS[locale] ?? LEDGER_NAME_WORDS[DEFAULT_LOCALE];
  const suffix = LEDGER_NAME_SUFFIX[locale] ?? LEDGER_NAME_SUFFIX[DEFAULT_LOCALE];
  const w = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000); // 4 位随机数，保证每次注册得到不同名称 / 4 random digits so every registration gets a distinct name
  return `${w}${suffix}-${num}`;
}
