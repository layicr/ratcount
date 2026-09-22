/**
 * ratcount · next-intl/server 测试桩（仅测试环境使用）
 *
 * 背景：next-intl@4 的 "./server" 子路径在 exports 中仅有 react-server / development /
 * default 条件且全部指向 ESM 构建（dist/esm），在纯 Node 测试进程（无 Next.js 请求
 * 上下文）中调用 getTranslations() 会直接抛错：
 *   "getTranslations is not supported in Client Components"
 * 因此测试文件通过 Module._load 拦截 "next-intl/server"，把请求重定向到本桩：
 *   - getTranslations 返回 (key) => key（翻译 key 原样返回，断言按 key 对齐）
 *   - getFormatter / getNow / getTimeZone 等仅需「可调用且不抛错」
 * 生产代码不受影响（本文件不在任何 import 路径上）。
 */
const t = (key) => key;

module.exports = {
  getTranslations: async () => t,
  getFormatter: async () => () => ({}),
  getNow: async () => new Date(),
  getTimeZone: async () => "Asia/Shanghai",
  setRequestLocale: () => {},
  getMessages: async () => ({}),
  getRequestConfig: () => ({}),
  unstable_setRequestLocale: () => {},
  hasLocale: async () => true,
};
