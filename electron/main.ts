// ratcount · Electron 主进程（Node）/ Electron main process
//  - 桌面架构：Electron 壳 + 本地 Next 独立服务（.next/standalone/server.js，子进程）。
//    动态路由 / Server Actions / 中间件 / Auth.js 全部照常工作，无需静态导出与 IPC 数据层。
//  - 数据文件优先落「RatCount.exe 同目录/data/ratcount.db」；若该目录不可写（如 C:\Program Files），
//    则回退到 userData（%APPDATA%/RatCount/data/ratcount.db）。也可将 DATABASE_URL 设为 libsql: 云端地址切到 Turso。
//  - 建表（ensureSchema）与审计清理定时器由 Next 侧 instrumentation.ts 在服务进程内执行。
import { app, BrowserWindow, dialog } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { DEPLOY_MODE_DESKTOP } from "../lib/runtime-types";
import { NODE_ENV } from "../lib/constants";

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let currentUrl = ""; // 开发态可经 DESKTOP_DEV_URL 直连已运行的 next dev
let serverReady = false; // 本地服务是否已就绪（首字节可访问）
let serverErrorShown = false; // 防止重复弹错误框
let serverStderr = ""; // 累积子进程 stderr，便于错误框展示真实原因

/** 包装 stdout/stderr 防止 console.log 因外部管道关闭（EPIPE）把主进程崩掉 / Prevent console EPIPE crash when parent pipe is closed */
function ignoreEpipe(stream: NodeJS.WritableStream) {
  stream.on("error", (err: any) => {
    if (err && err.code === "EPIPE") return;
  });
}
ignoreEpipe(process.stdout);
ignoreEpipe(process.stderr);

/** 本地数据文件 URL（方案 C）。
 *  优先放在 RatCount.exe 同目录/data/ratcount.db（便于随程序带走、U 盘便携）；
 *  若该目录不可写（如默认装到 C:\Program Files 且非管理员），则回退到 userData
 *  （%APPDATA%/RatCount/data/ratcount.db），保证标准用户也能正常建库启动。
 *  Prefer exe-adjacent path; fall back to userData when not writable. */
function dataFileUrl(): string {
  const tryDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath();
  const preferred = join(tryDir, "data", "ratcount.db");
  try {
    mkdirSync(join(tryDir, "data"), { recursive: true });
    return `file:${preferred}`;
  } catch {
    // 目录不可写（多为 Program Files 无权限），回退 userData
    return `file:${join(app.getPath("userData"), "data", "ratcount.db")}`;
  }
}

/** Next standalone 服务入口。
 *  打包后用 asar 时，standalone 目录会被 asarUnpack 解压到 app.asar.unpacked；
 *  server.js 启动时会 process.chdir(__dirname)，asar 虚拟路径不支持 chdir，
 *  因此若 unpacked 目录存在，优先用真实文件路径。
 *  When packaged with asar, use the asar.unpacked path so server.js chdir works. */
function serverEntry(): string {
  const appPath = app.getAppPath();
  const unpacked = appPath.replace(/\.asar$/, ".asar.unpacked");
  const useUnpacked = app.isPackaged && existsSync(join(unpacked, ".next", "standalone", "server.js"));
  return join(useUnpacked ? unpacked : appPath, ".next", "standalone", "server.js");
}

/** 取一个空闲端口，避免与本机其他服务冲突 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** 轮询等待本地服务就绪 */
function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { method: "GET" });
        if (res.status < 500) return resolve();
      } catch {
        /* 尚未就绪，继续轮询 */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("本地服务启动超时"));
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function startLocalServer(port: number): Promise<void> {
  serverProcess = spawn(process.execPath, [serverEntry()], {
    env: {
      ...process.env,
      // 让 electron.exe 以纯 Node 模式运行 server.js，不初始化 Electron 应用、
      // 不创建 Job Object，避免 Windows 下 AssignProcessToJobObject 崩溃。
      // Run electron.exe as a plain Node runtime for the Next standalone server.
      ELECTRON_RUN_AS_NODE: "1",
      DATABASE_URL: process.env.DATABASE_URL ?? dataFileUrl(),
      AUTH_SECRET: process.env.AUTH_SECRET ?? "change-me-in-production-desktop-secret",
      NEXT_PUBLIC_DEPLOY_MODE: DEPLOY_MODE_DESKTOP,
      NODE_ENV: NODE_ENV.production,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout?.on("data", (d) => console.log("[next]", String(d).trim()));
  serverProcess.stderr?.on("data", (d) => {
    const text = String(d);
    serverStderr += text;
    console.error("[next:err]", text.trim());
  });
  // 子进程在就绪前异常退出 → 立即弹错误框（含真实 stderr 尾部）
  serverProcess.on("exit", (code, signal) => {
    console.log(`[next] 退出 code=${code} signal=${signal}`);
    if (!serverReady) {
      showServerError(
        "本地服务启动失败 / Failed to start local server",
        `子进程异常退出（code=${code}${signal ? `, signal=${signal}` : ""}）。\n\n${serverStderr.slice(-2000)}`
      );
    }
  });
  try {
    await waitForServer(`http://127.0.0.1:${port}/`);
    serverReady = true;
  } catch (err) {
    showServerError(
      "本地服务启动超时 / Local server timed out",
      `${String((err as Error)?.message ?? err)}\n\n${serverStderr.slice(-2000)}`
    );
    throw err;
  }
}

/** 弹出错误框（不依赖窗口，主进程未就绪也可用）；serverErrorShown 防重复 */
function showServerError(title: string, detail: string): void {
  if (serverErrorShown) return;
  serverErrorShown = true;
  dialog.showErrorBox(title, detail);
}

function createWindow(url: string) {
  mainWindow = new BrowserWindow({ width: 1280, height: 800 });
  mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  try {
    // 开发态：直连已运行的 next dev（由 DESKTOP_DEV_URL 指定），不启动 standalone 子进程
    const devUrl = process.env.DESKTOP_DEV_URL;
    if (devUrl) {
      currentUrl = devUrl;
    } else {
      const port = await findFreePort();
      await startLocalServer(port);
      currentUrl = `http://127.0.0.1:${port}`;
    }
    createWindow(currentUrl);
  } catch (err) {
    console.error("[desktop] 启动失败:", err);
    dialog.showErrorBox("启动失败 / Startup failed", String((err as Error)?.message ?? err));
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(currentUrl);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  serverProcess?.kill();
  serverProcess = null;
});
