// ratcount · 补齐 Next standalone 产物（构建脚本）/ Prepare Next standalone output
//  - standalone 输出不含 .next/static 与 public，需手动拷贝，否则页面样式/静态资源 404。
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const standalone = join(".next", "standalone");
if (!existsSync(standalone)) {
  console.error("未找到 .next/standalone，请先执行 next build（桌面模式）");
  process.exit(1);
}

const copyPairs = [
  [join(".next", "static"), join(standalone, ".next", "static")],
  ["public", join(standalone, "public")],
];

for (const [from, to] of copyPairs) {
  if (!existsSync(from)) {
    console.log(`skip ${from}（不存在）`);
    continue;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
