// ratcount · 主进程打包脚本（esbuild）/ Electron main-process bundler
//  - 主进程仅依赖 electron 与 node 内置模块，无需 '@/*' 别名解析。
import { build } from "esbuild";

await build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: "dist/main.js",
  external: ["electron"],
  logLevel: "info",
});

console.log("built electron/main.ts -> dist/main.js");
