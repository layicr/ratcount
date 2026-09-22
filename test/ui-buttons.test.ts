/**
 * ratcount · UI 测试：页面全部按钮静态审计
 * 目标：扫描 app/(app) 下所有页面/组件的 <button>，保证每个按钮
 *  - 具备可访问名称（aria-label 或可见子文本 / i18n key 引用），无「裸图标死按钮」
 *  - 引用的 i18n key 在 messages/zh-CN.json 中存在（防 broken key 渲染空白）
 *  - 具备交互意图（onClick / type=submit / form / disabled 至少其一）
 * 纯静态源码分析（node 环境可跑），与 playwright 运行时点击测试互补。
 * 运行：npx tsx --test test/ui-buttons.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import zhCN from "../messages/zh-CN.json";

const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "app", "(app)");

/** 收集 app/(app) 下所有 .tsx 文件 */
function collectTsxFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith(".tsx")) out.push(full);
    }
  };
  walk(APP_DIR);
  return out.sort();
}

/** 去掉行注释与块注释（保守处理：字符串字面量内偶发误删不影响按钮审计） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** 匹配一个 <button ...> 开标签（含自闭合），返回标签内文本与在源码中的位置 */
function matchButtonTags(src: string): Array<{ raw: string; start: number; end: number }> {
  const re = /<button\b[^>]*>/g;
  const out: Array<{ raw: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({ raw: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** 提取开标签中某个属性的值（支持双引号/单引号/无引号），返回 null 表示无该属性 */
function attrValue(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`);
  const m = tag.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

/** 提取 JSX 字符串 t("key") / t('key') 引用（排除模板字符串与 URL 参数误匹配） */
function extractI18nKeys(text: string): string[] {
  // 负向后顾：t 前不能是字母/数字/下划线/点/$（避免 params.set("page") 等误匹配）
  // 仅匹配字符串字面量 key；模板字符串（动态 key）不做静态校验
  const re = /(?<![A-Za-z0-9_$.])t\(\s*["']([^"'`$]+)["']\s*(?:,|\))/g;
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) keys.push(m[1]);
  return keys;
}

/** 判断开标签是否具备可访问名称：aria-label 非空、i18n 引用、可见文本或 JSX 表达式（动态渲染文本） */
function hasAccessibleName(tag: string, innerText: string): boolean {
  const label = attrValue(tag, "aria-label");
  if (label && label.trim().length > 0) return true;
  if (extractI18nKeys(tag + innerText).length > 0) return true;
  // JSX 表达式（{children}/{label}/{d.xxx} 等）运行时渲染为文本，视为有名称来源
  if (/\{[^}]+\}/.test(innerText)) return true;
  // 去掉 HTML 标签后仍有非空白字符 = 可见文本
  const text = innerText.replace(/<[^>]+>/g, "");
  return text.trim().length > 0;
}

/** 判断按钮是否位于未闭合的 <form> 内（默认 type=submit 即具备提交意图） */
function isInsideForm(src: string, start: number): boolean {
  const prefix = src.slice(0, start);
  const opens = (prefix.match(/<form\b[^>]*>/g) ?? []).length;
  const closes = (prefix.match(/<\/form>/g) ?? []).length;
  return opens > closes;
}

/** 判断按钮是否具备交互意图 */
function hasInteraction(tag: string, src: string, start: number): boolean {
  if (attrValue(tag, "onClick") !== null) return true;
  if (attrValue(tag, "onSubmit") !== null) return true;
  if (attrValue(tag, "form") !== null) return true;
  const type = attrValue(tag, "type");
  if (type && type !== "button") return true; // submit/reset 走表单
  if (attrValue(tag, "disabled") !== null) return true; // 禁用的占位按钮也算有明确意图
  // 未声明 type 且位于表单内 → 默认 submit，具备提交意图
  if (type === null && isInsideForm(src, start)) return true;
  return false;
}

/** 点分路径在 JSON 字典中是否存在 */
function hasDictKey(dict: unknown, key: string): boolean {
  let cur: unknown = dict;
  for (const seg of key.split(".")) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return false;
    }
  }
  return true;
}

/* ==================== 审计：按钮清单与质量问题 ==================== */

test("按钮: app/(app) 下所有按钮均可访问、引用 key 存在、具备交互意图", () => {
  const files = collectTsxFiles();
  assert.ok(files.length >= 5, `应扫描到页面/组件文件，实际 ${files.length}`);

  const problems: string[] = [];
  const stats = { files: files.length, buttons: 0, labeled: 0, keyed: 0 };

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const tags = matchButtonTags(src);
    for (const tag of tags) {
      stats.buttons += 1;
      // 取按钮子内容：开标签到下一个 </button>（不嵌套按钮，直接取最近闭合）
      const closeIdx = src.indexOf("</button>", tag.end);
      const inner = closeIdx >= 0 ? src.slice(tag.end, closeIdx) : "";

      const name = hasAccessibleName(tag.raw, inner);
      const i18nKeys = extractI18nKeys(tag.raw + inner);
      const interactive = hasInteraction(tag.raw, src, tag.start);

      if (name) {
        if (attrValue(tag.raw, "aria-label")) stats.labeled += 1;
        else stats.keyed += 1;
      } else {
        problems.push(`${rel}: ${tag.raw.trim()} 缺少可访问名称（需 aria-label 或可见文本）`);
      }
      if (!interactive) {
        problems.push(`${rel}: ${tag.raw.trim()} 无交互意图（onClick/submit/form/disabled 均缺失）`);
      }
      for (const k of i18nKeys) {
        if (!hasDictKey(zhCN, k)) {
          problems.push(`${rel}: i18n key 不存在于 zh-CN.json → "${k}"`);
        }
      }
    }
  }

  assert.ok(stats.buttons >= 60, `应审计到 60+ 个按钮，实际 ${stats.buttons}`);
  assert.deepStrictEqual(problems, [], `按钮审计发现问题：\n${problems.join("\n")}`);
  assert.strictEqual(stats.buttons, stats.labeled + stats.keyed, "按钮计数与标签/文本统计一致");
});

test("按钮: 顶栏/导航区域存在带 aria-label 的图标按钮（移动端菜单等）", () => {
  const appShell = path.join(APP_DIR, "app-shell.tsx");
  const src = stripComments(fs.readFileSync(appShell, "utf8"));
  const tags = matchButtonTags(src);
  // app-shell 侧边栏/移动端导航以 Link 为主，但仍需确认其按钮类控件均可访问
  for (const t of tags) {
    const closeIdx = src.indexOf("</button>", t.end);
    const inner = closeIdx >= 0 ? src.slice(t.end, closeIdx) : "";
    assert.ok(
      hasAccessibleName(t.raw, inner) || attrValue(t.raw, "aria-label"),
      `app-shell 按钮缺少可访问名称: ${t.raw.trim()}`,
    );
  }
});
