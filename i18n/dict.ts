import { getResolvedLocale } from "@/lib/languages";
import { DEFAULT_LANGUAGE } from "@/lib/constants";
import {
  dictionaries,
  type RawDict,
  type AppLocale,
} from "./routing";

/**
 * ratcount · 字典加载原语（替代已删除的 lib/i18n.ts shim）
 *  - getMergedDict：加载指定 locale 的 messages 并复刻原 mergeWithCommon 注入语义
 *    （common 顶层字符串键浅注入到每个非 common 命名空间，t("ns.commonKey") 与原
 *    d.ns.commonKey 等价，避免迁移后文案缺失）
 *  - readLocale：服务端读当前语言（cookie > languages 表默认 > zh-CN），供 API route
 *    等无 next-intl 请求上下文的场景使用（等价原 lib/i18n.ts 的 getLocale）
 */
type CommonSection = RawDict["common"];
/** common 中的字符串键（不含 pager/dialogs 嵌套对象），注入到每个命名空间 */
type CommonStrings = Omit<CommonSection, "pager" | "dialogs">;
/**
 * 合并后的字典类型：仅「对象类型」的命名空间与 common 字符串键交叉（可 t("ns.commonKey")），
 * 根级标量键（如 appName / tagline）保持原类型，避免 string 与对象交集塌缩为 never，
 * 且 t("tagline") 全路径访问语义不受影响。
 */
export type AppDict = {
  [K in keyof RawDict]: K extends "common"
    ? CommonSection
    : RawDict[K] extends Record<string, unknown>
      ? RawDict[K] & CommonStrings
      : RawDict[K];
};

/**
 * 复刻原 lib/i18n.ts 的 mergeWithCommon：把 common 顶层字符串键浅合并进每个
 * 「对象类型」的非 common 命名空间；根级标量键（字符串等）原样保留透传，
 * 避免字符串被展开成字符索引对象导致 t("tagline") 解析失败。
 */
export function mergeWithCommon(dict: RawDict): AppDict {
  const common = dict.common as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [ns, val] of Object.entries(dict)) {
    if (ns === "common") {
      out[ns] = val;
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      out[ns] = { ...common, ...(val as Record<string, unknown>) };
    } else {
      // 标量（字符串 / 数字 / 布尔等）原样透传，不做 common 合并
      out[ns] = val;
    }
  }
  return out as unknown as AppDict;
}

/** 获取指定语言字典（已注入 common） */
export function getMergedDict(locale: AppLocale): AppDict {
  const map = dictionaries as unknown as Record<AppLocale, RawDict>;
  return mergeWithCommon(map[locale] ?? map[DEFAULT_LANGUAGE]);
}

/** 从合并字典构造全路径 translator（旧 helper 如 distTypeLabel 调用处等价适配用；缺键返回 key 本身） */
export function makeDictTranslator(d: AppDict): (key: string) => string {
  const lookup = d as unknown as Record<string, unknown>;
  return (key: string) => {
    let cur: unknown = lookup;
    for (const part of key.split(".")) {
      if (cur && typeof cur === "object") {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        return key;
      }
    }
    return typeof cur === "string" ? cur : key;
  };
}

/**
 * 服务端读当前语言（无 next-intl 请求上下文时的 fallback）
 * 优先级：用户 cookie(money_locale) > 全局默认语言(languages 表) > zh-CN
 */
/** 当前语言（无 next-intl 请求上下文时的 fallback）：统一委托 getResolvedLocale 的加载顺序 */
export async function readLocale(): Promise<AppLocale> {
  return getResolvedLocale();
}
