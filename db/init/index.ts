/**
 * db:init 执行器 / Init runner
 * 在 `npm run db:push`（drizzle-kit push）之后，按文件名顺序运行 db/init 下的所有脚本。
 * After `npm run db:push`, executes every script under db/init in filename order.
 * 每个脚本只要导出 `run()` 就会被调用；后续新增 `02-*.ts` 等会自动纳入，无需改这里。
 * Any file exporting a `run()` is invoked; adding e.g. `02-*.ts` is auto-included.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));

async function main(): Promise<void> {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .sort();

  if (files.length === 0) {
    console.log("⏭ db:init · db/init 下无脚本可运行");
    return;
  }

  for (const file of files) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (typeof mod.run === "function") {
      console.log(`▶ db:init · 执行 ${file}`);
      await mod.run();
    } else {
      console.log(`⏭ db:init · 跳过 ${file}（无 run 导出）`);
    }
  }
  console.log("✅ db:init 完成");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ db:init 失败", e);
    process.exit(1);
  });
