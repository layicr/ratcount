/**
 * 测试辅助：临时开关登录验证码（移动端实测用，测完恢复 true）
 * 用法：npx tsx test/toggle-captcha.ts false | true
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { settings } from "../db/schema";

const v = process.argv[2] === "true" ? "true" : "false";

async function main() {
  await db
    .update(settings)
    .set({ value: v })
    .where(eq(settings.key, "enable_login_captcha"));
  console.log(`enable_login_captcha -> ${v}`);
  process.exit(0);
}
main();
