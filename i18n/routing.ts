import { defineRouting } from "next-intl/routing";
import en from "@/messages/en.json";
import zh from "@/messages/zh-CN.json";
import zhTW from "@/messages/zh-TW.json";
import { LOCALE_COOKIE_NAME, DEFAULT_LANGUAGE } from "@/lib/constants";

/**
 * ratcount · next-intl 路由配置
 *  - localePrefix: 'never'：基于 cookie 切换语言，不改 URL 结构
 *  - locales：已提供翻译文件的语言静态超集；运行期启用与否由 languages 表决定
 *  - 新增语言：在 languages 表插入行 + 新增 messages/{code}.json + 扩展此数组
 */
/**
 * 已提供翻译文件的语言「静态超集」。
 * - 编译期约束：next-intl 要求 locales 为字面量数组，用于类型生成与 middleware 匹配。
 * - 运行期启用与否由 languages 表决定（见 lib/languages.ts）。
 * - 新增语言：在 languages 表插入行 + 新增 messages/{code}.json + 扩展此数组。
 */
export const locales = ["zh-CN", "en", "zh-TW"] as const;

/** 默认语言（静态回退；运行期以 languages 表 is_default 为准）。真源为 lib/constants 的 DEFAULT_LANGUAGE */
export const DEFAULT_LOCALE = DEFAULT_LANGUAGE;

/** 各语言 messages 字典（key 与 locales 一一对应） */
export const dictionaries = { "zh-CN": zh, en, "zh-TW": zhTW } as const;

/** 各语言展示标签，用于后台表单「名称（中文）」等。新增语言时同步扩展。 */
export const localeLabels: Record<AppLocale, string> = {
  "zh-CN": "中文",
  en: "English",
  "zh-TW": "繁體中文",
};

/** 原始字典类型（以 zh-CN 为基准结构，所有语言 key 结构一致） */
export type RawDict = (typeof dictionaries)["zh-CN"];

export const routing = defineRouting({
  locales,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "never",
  localeDetection: true,
  localeCookie: { name: LOCALE_COOKIE_NAME },
});

export type AppLocale = (typeof locales)[number];
