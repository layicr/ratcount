/**
 * ratcount · 语言表（DB 驱动）服务端只读访问
 *  - 语言清单（启用/默认/排序/显示名）存于 languages 表，后台可运营
 *  - 带内存缓存（60s）+ 静态回退（lib/localize），运行期零每请求查库
 *  - 仅在服务器使用（依赖 db）
 * ratcount · DB-driven language table (server-side, read-only)
 *  - The language list (enabled/default/sort/display name) lives in the languages table, operator-manageable
 *  - In-memory cache (60s) + static fallback (lib/localize): zero per-request DB reads at runtime
 *  - Server-only (depends on db)
 */
import { db } from "./db";
import { languages as languagesTable } from "@/db/schema";
import { cookies } from "next/headers";
import { type AppLocale, routing, DEFAULT_LOCALE } from "@/i18n/routing";
import { LOCALE_COOKIE_NAME } from "@/lib/constants";
import {
  locales as fallbackLocales,
  defaultLocale as fallbackDefault,
  localeLabels as fallbackLabels,
} from "./localize";

/** 对齐 i18n/routing 的 AppLocale（next-intl 派生，替代已删除的 lib/i18n.ts shim 类型）/ Aligns with i18n/routing's AppLocale (next-intl derived; replaces the removed lib/i18n.ts shim type) */
type Locale = AppLocale;

type LangRow = {
  code: string;
  nativeName: string;
  isDefault: boolean;
  isEnabled: boolean;
  sort: number;
};

let cache: { rows: LangRow[]; at: number } | null = null;
const TTL = 60_000;

async function loadRows(): Promise<LangRow[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const rows = await db
    .select({
      code: languagesTable.code,
      nativeName: languagesTable.nativeName,
      isDefault: languagesTable.isDefault,
      isEnabled: languagesTable.isEnabled,
      sort: languagesTable.sort,
    })
    .from(languagesTable)
    .orderBy(languagesTable.sort);
  cache = { rows, at: Date.now() };
  return cache.rows;
}

/** 写操作后调用，使缓存失效 / Invalidate the cache after a write */
export function invalidateLanguagesCache() {
  cache = null;
}

/** 已启用语言（按 sort 顺序）；无数据回退静态 locales / Enabled locales (by sort order); falls back to static locales when empty */
export async function getEnabledLocales(): Promise<Locale[]> {
  const rows = await loadRows();
  const enabled = rows.filter((r) => r.isEnabled).map((r) => r.code as Locale);
  return enabled.length ? enabled : (fallbackLocales as Locale[]);
}

/** 全局默认语言；无数据回退静态 defaultLocale / Global default locale; falls back to the static defaultLocale when empty */
export async function getDefaultLocale(): Promise<Locale | undefined> {
  const rows = await loadRows();
  const def = rows.find((r) => r.isDefault);
  return (def?.code as Locale) ?? fallbackDefault;
}

/**
 * 语言加载顺序 / Locale loading order:
 *   1) 用户 cookie `money_locale`（用户偏好，最高优先）
 *   2) 全局默认语言 languages.is_default（后台可运营；DB 不足时回退静态 DEFAULT_LOCALE）
 *   3) 静态兜底 DEFAULT_LOCALE（"zh-CN"）
 * 数据库未就绪（表不存在 / 连接失败）或无 cookie 时逐级回退，保证界面不 500。
 *   1) User cookie `money_locale` (user preference, highest priority)
 *   2) Global default language languages.is_default (operator-managed; static DEFAULT_LOCALE when DB is short)
 *   3) Static fallback DEFAULT_LOCALE ("zh-CN")
 * Falls back step by step when the DB is unavailable or no cookie exists, so the UI never 500s.
 */
export async function getResolvedLocale(): Promise<Locale> {
  // 1) 用户 cookie（用户偏好）/ User cookie (preference)
  try {
    const store = await cookies();
    const v = store.get(LOCALE_COOKIE_NAME)?.value;
    if (v && routing.locales.includes(v as AppLocale)) return v as Locale;
  } catch {
    /* 非请求上下文（如静态生成），忽略后走后续回退 / Non-request context (e.g. static generation); skip and continue fallback */
  }
  // 2) 全局默认语言（DB，带缓存 + 静态回退）/ Global default (DB, cached + static fallback)
  try {
    const def = await getDefaultLocale();
    if (def && routing.locales.includes(def as AppLocale)) return def as Locale;
  } catch {
    /* DB 不可用时忽略，继续静态兜底 / Ignore on DB failure, continue to static fallback */
  }
  // 3) 静态兜底 / Static fallback
  return DEFAULT_LOCALE;
}

/** code → 本语显示名；合并静态回退 / code → native display name; merged with the static fallback */
export async function getLocaleLabels(): Promise<Record<string, string>> {
  const rows = await loadRows();
  const out: Record<string, string> = { ...fallbackLabels };
  for (const r of rows) out[r.code] = r.nativeName || r.code;
  return out;
}
