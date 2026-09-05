import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const s = await db.all(sql`SELECT name FROM pragma_table_info('settings')`);
  const a = await db.all(sql`SELECT name FROM pragma_table_info('audit_logs')`);
  console.log("settings cols:", (s as { name: string }[]).map((x) => x.name).join(","));
  console.log("audit_logs cols:", (a as { name: string }[]).map((x) => x.name).join(","));
  const g = await db.all(sql`SELECT name,key,value,user_id FROM settings`);
  console.log("global settings:", JSON.stringify(g));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
