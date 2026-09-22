/**
 * ratcount · 时区静态配置（不走数据库）
 *  - 时区标识为 IANA 名（来自 timezones.generated.ts 的 Intl.supportedValuesOf('timeZone')）
 *  - 多语言显示名由 Intl.DisplayNames 运行期生成（见 tzLabel），无需翻译文件，新增语言零改代码
 *  - 真实换算一律交给 Intl(ICU)；本文件只存常用子集 + 默认/校验/展示工具
 */
import { ALL_TIME_ZONES } from "./timezones.generated";
import type { AppLocale } from "./routing";
import { TIME_ZONE_COOKIE } from "@/lib/constants";

/** 全量 IANA 时区标识（418 条，自动生成） */
export const TIME_ZONE_CODES = ALL_TIME_ZONES;

/**
 * 常用时区（UI 下拉优先渲染），按 UTC 偏移升序。
 * 其余时区仍在 TIME_ZONE_CODES 全量中，可按需扩展或改用搜索。
 */
export const COMMON_TIME_ZONES = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

/** 全局默认时区（cookie 缺失/非法时的兜底） */
export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

/** 校验并回退，防止非法 IANA 名让 Intl 抛 RangeError */
export function normalizeTimeZone(v: string | undefined | null): string {
  return v && (TIME_ZONE_CODES as readonly string[]).includes(v)
    ? v
    : DEFAULT_TIME_ZONE;
}

/**
 * 计算某时区相对 UTC 的偏移（分钟）。
 * 用「该时区墙钟时间当作 UTC」与真实 UTC 之差得到偏移；
 * 仅读取数值字段，不依赖 ICU 时区名/偏移字符串，服务端/客户端结果一致，避免 hydration mismatch。
 */
function tzOffsetMinutes(code: string): number {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: code,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const hour = (parseInt(parts.hour ?? "0", 10) || 0) % 24;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - now.getTime()) / 60000);
}

/** 偏移短标签：GMT+08:00 / GMT-05:00 / GMT+05:30 / GMT+00:00（自格式化，跨环境一致） */
function offsetLabel(code: string): string {
  let mins: number;
  try {
    mins = tzOffsetMinutes(code);
  } catch {
    return "GMT+00:00";
  }
  const sign = mins < 0 ? "-" : "+";
  const abs = Math.abs(mins);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `GMT${sign}${hh}:${mm}`;
}

/** 常用时区回退名：运行环境 Intl.DisplayNames 不支持 type:'timeZone'（部分 Node 构建缺时区显示数据会抛 RangeError）时兜底，保证 SSR 不崩 */
const COMMON_TZ_FALLBACK: Record<string, string> = {
  UTC: "UTC",
  "Pacific/Honolulu": "Honolulu",
  "America/Anchorage": "Anchorage",
  "America/Los_Angeles": "Los Angeles",
  "America/Denver": "Denver",
  "America/Chicago": "Chicago",
  "America/New_York": "New York",
  "America/Sao_Paulo": "Sao Paulo",
  "Europe/London": "London",
  "Europe/Paris": "Paris",
  "Europe/Berlin": "Berlin",
  "Europe/Moscow": "Moscow",
  "Asia/Dubai": "Dubai",
  "Asia/Karachi": "Karachi",
  "Asia/Kolkata": "Kolkata",
  "Asia/Bangkok": "Bangkok",
  "Asia/Jakarta": "Jakarta",
  "Asia/Shanghai": "Shanghai",
  "Asia/Hong_Kong": "Hong Kong",
  "Asia/Taipei": "Taipei",
  "Asia/Singapore": "Singapore",
  "Asia/Manila": "Manila",
  "Asia/Seoul": "Seoul",
  "Asia/Tokyo": "Tokyo",
  "Australia/Sydney": "Sydney",
  "Pacific/Auckland": "Auckland",
};

/**
 * 时区标签：(GMT+08:00) Shanghai
 *  - 名称取自静态表 COMMON_TZ_FALLBACK，偏移由数值计算自格式化；
 *    二者均不依赖 ICU 时区名/偏移字符串差异，保证 SSR 与 CSR 输出完全一致，消除 hydration mismatch。
 *  - _locale 保留以兼容既有调用（名称统一用静态表，不再走 Intl.DisplayNames）。
 */
export function tzLabel(code: string, _locale?: AppLocale | string): string {
  const name = COMMON_TZ_FALLBACK[code] ?? code;
  return `(${offsetLabel(code)}) ${name}`;
}
