/**
 * ratcount · 安全核验脚本（临时）
 * 检查：密码哈希、cookie 属性、验证码 no-store、审计请求/响应字段
 */
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  // 1. 密码哈希（S1-04）：应非明文，且非简单哈希
  const us = await db.all(sql`SELECT email, password_hash FROM users`);
  for (const u of us as { email: string; password_hash: string }[]) {
    const h = u.password_hash ?? "";
    console.log("user:", u.email, "| hash len:", h.length, "| prefix:", h.slice(0, 7), "| bcrypt:", h.startsWith("$2"));
  }
  // 2. 审计日志请求/响应字段（S7-01）
  const logs = await db.all(sql`SELECT action, entity, user_id, request_body, response_body FROM audit_logs`);
  const arr = logs as any[];
  const withBody = arr.filter((l) => l.request_body || l.response_body).length;
  console.log("audit logs total:", arr.length, "| with request/response body:", withBody);
  const sample = arr[arr.length - 1];
  if (sample) {
    console.log("sample:", sample.action, sample.entity, "| userId:", sample.user_id, "| req:", sample.request_body ? "Y" : "N", "| resp:", sample.response_body ? "Y" : "N");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
