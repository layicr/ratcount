/**
 * ratcount · 风格（主题）定义
 *  - 个人中心「风格设置」与全局设置「默认风格」共用同一份列表，避免两处漂移
 *  - light 为默认（无 class）；dark 用 .dark；其余彩色主题用 .theme-<code>
 *  - CSS 变量与 utility 覆盖见 app/globals.css
 */

/** 主题 code 字面量类型 */
export type ThemeCode =
  | "light"
  | "dark"
  | "ocean"
  | "forest"
  | "sunset"
  | "lavender"
  | "rose";

/** 主题列表：code + 预览色（显示名取 i18n 命名空间 theme.*，组件内 t(`theme.${code}`)） */
export const THEME_ITEMS: ReadonlyArray<{ code: ThemeCode; color: string }> = [
  { code: "light", color: "#0d9488" },
  { code: "dark", color: "#1e293b" },
  { code: "ocean", color: "#2563eb" },
  { code: "forest", color: "#16a34a" },
  { code: "sunset", color: "#ea580c" },
  { code: "lavender", color: "#7c3aed" },
  { code: "rose", color: "#e11d48" },
];

/** 合法主题 code 列表（后端校验白名单用） */
export const THEME_CODES: readonly string[] = THEME_ITEMS.map((t) => t.code);

/** 默认风格：settings 表 default_theme 缺失时的回退值 */
export const DEFAULT_THEME = "light";

/** 切换主题时需清理的 class 白名单 */
const THEME_CLASSES = [
  "dark",
  "theme-ocean",
  "theme-forest",
  "theme-sunset",
  "theme-lavender",
  "theme-rose",
] as const;

/** 应用主题到 <html>：先清所有主题 class，再按 code 添加（light 无需 class） */
export function applyThemeToDocument(code: string) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  for (const c of THEME_CLASSES) el.classList.remove(c);
  if (code === "dark") el.classList.add("dark");
  else if (code !== "light") el.classList.add(`theme-${code}`);
}

/** 归一化主题 code：非法值回退默认风格 */
export function normalizeTheme(code: string | null | undefined): string {
  return code && THEME_CODES.includes(code) ? code : DEFAULT_THEME;
}

/** 合法主题 code 或 null（不做兜底，供优先级链逐级判断用） */
export function validThemeCode(code: string | null | undefined): string | null {
  return code && THEME_CODES.includes(code) ? code : null;
}

/**
 * 首屏风格解析（服务端 / 客户端同源，避免两端不一致与闪烁）
 * 优先级 / Precedence：
 *   1. 账号偏好 user_profiles.theme_code —— 跨设备跟随
 *   2. 本机 cookie money_theme           —— 本机浏览器选择
 *   3. 全局默认 settings.default_theme   —— 管理员设置
 *   4. light                             —— 最终兜底
 */
export function resolveThemeCode(
  userTheme?: string | null,
  localTheme?: string | null,
  defaultTheme?: string | null,
): string {
  return validThemeCode(userTheme) ?? validThemeCode(localTheme) ?? validThemeCode(defaultTheme) ?? DEFAULT_THEME;
}

/** 主题 code → <html> 上的 class（light 无需 class；dark 用 dark；其余用 theme-<code>） */
export function themeClassName(code: string | null | undefined): string | undefined {
  const c = validThemeCode(code) ?? DEFAULT_THEME;
  return c === DEFAULT_THEME ? undefined : c === "dark" ? "dark" : `theme-${c}`;
}
