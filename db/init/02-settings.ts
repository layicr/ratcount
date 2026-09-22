/**
 * 全局设置 + 币种 + 语言 定义数据（init 与 seed 共用）/ Global settings + currencies + languages (shared by init & seed)
 * settings 表：key-value 对，userId='global' 表示全局项 / settings table: key-value pairs; userId='global' means global
 * 在 db:push 之后由 db/init/index.ts 自动执行（幂等）/ Auto-run after db:push by db/init/index.ts (idempotent).
 */
import { DEFAULT_LANGUAGE, GLOBAL_USER_ID } from "../../lib/constants";
import { db } from "../../lib/db";
import { settings, currencies, languages } from "../../db/schema";

export type SettingDef = {
  name: string;
  key: string;
  value: string;
};

/** 全局设置列表（顺序与系统设置页控件顺序一致 / Same order as the settings page form） */
export const SETTING_DEFS: SettingDef[] = [
  { name: "程序名称",            key: "app_name",             value: '{"zh-CN":"ratcount","en":"RatCount","zh-TW":"ratcount"}' },
  // 空值：界面回退 i18n 文案（login.subtitle / tagline）/ Empty → falls back to i18n copy
  { name: "应用宣言",            key: "app_slogan",           value: '{"zh-CN":"","en":"","zh-TW":""}' },
  { name: "默认语言",            key: "default_locale",       value: DEFAULT_LANGUAGE },
  { name: "默认时区",            key: "default_timezone",     value: "Asia/Shanghai" },
  { name: "默认风格代码",        key: "default_theme",        value: "light" },
  { name: "允许注册",            key: "allow_registration",   value: "true" },
  { name: "登录验证码",          key: "enable_login_captcha", value: "true" },
  { name: "日志保留天数",        key: "audit_log_retention_days", value: "90" },
  { name: "版权信息",            key: "copyright",            value: "© 2026 ratcount · 本地与 Turso 双部署" },
  { name: "允许的每页条数",      key: "allowed_page_sizes",   value: "10,20,50,100" },
  { name: "默认每页条数",        key: "default_page_size",    value: "20" },
];

export type CurrencyDef = {
  code: string;
  symbol: string;
  name: string;
  /** 汇率（相对于基准 CNY）/ rate (vs base CNY) */
  rate: string;
  isBase: boolean;
  isActive: boolean;
  sort: number;
};

/** 演示用币种列表 / Demo currency list */
export const CURRENCY_DEFS: CurrencyDef[] = [
  { code: "CNY", symbol: "¥",  name: "人民币 CNY", rate: "1",        isBase: true,  isActive: true, sort: 0 },
  { code: "USD", symbol: "$",  name: "美元 USD",    rate: "7.2",      isBase: false, isActive: true, sort: 1 },
  { code: "EUR", symbol: "€",  name: "欧元 EUR",    rate: "7.8",      isBase: false, isActive: true, sort: 2 },
  { code: "JPY", symbol: "¥",  name: "日元 JPY",    rate: "0.048",    isBase: false, isActive: true, sort: 3 },
  { code: "HKD", symbol: "HK$", name: "港币 HKD",   rate: "0.92",     isBase: false, isActive: true, sort: 4 },
  { code: "GBP", symbol: "£",  name: "英镑 GBP",    rate: "9.1",      isBase: false, isActive: true, sort: 5 },
];

export type LanguageDef = {
  code: string;
  name: string;
  nativeName: string;
  isDefault: boolean;
  isEnabled: boolean;
  sort: number;
  createdBy?: string | null;
  updatedBy?: string | null;
};

/** 演示用语言列表 / Demo language list */
export const LANGUAGE_DEFS: LanguageDef[] = [
  { code: DEFAULT_LANGUAGE, name: "中文",     nativeName: "中文",     isDefault: true,  isEnabled: true, sort: 1, createdBy: "admin", updatedBy: "admin" },
  { code: "en",    name: "English",  nativeName: "English",  isDefault: false, isEnabled: true, sort: 2, createdBy: "admin", updatedBy: "admin" },
  { code: "zh-TW", name: "繁體中文", nativeName: "繁體中文", isDefault: false, isEnabled: true, sort: 3, createdBy: "admin", updatedBy: "admin" },
];

/**
 * 幂等写入全局设置（userId='global'）+ 币种 + 语言目录。
 * Idempotently seed global settings (userId='global') + currencies + languages.
 */
export async function run(): Promise<void> {
  console.log("🔧 init · 全局设置 + 币种 + 语言（幂等）/ global settings + currencies + languages (idempotent)");
  for (const s of SETTING_DEFS) {
    await db.insert(settings)
      .values({ ...s, userId: GLOBAL_USER_ID })
      .onConflictDoNothing({ target: [settings.userId, settings.key] });
  }
  for (const c of CURRENCY_DEFS) {
    await db.insert(currencies).values(c).onConflictDoNothing({ target: currencies.code });
  }
  for (const l of LANGUAGE_DEFS) {
    await db.insert(languages).values(l).onConflictDoNothing({ target: languages.code });
  }
  console.log(`   ✅ 全局设置 ${SETTING_DEFS.length} 项、币种 ${CURRENCY_DEFS.length} 项、语言 ${LANGUAGE_DEFS.length} 项`);
}
