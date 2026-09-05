import { createClient } from "@libsql/client";

/** 创建新增索引（transactionTags tagId / audit_logs entity） */
const client = createClient({ url: "file:./data/ratcount.db" });

async function main() {
  const statements = [
    "CREATE INDEX IF NOT EXISTS tx_tags_tag_idx ON transaction_tags(tag_id)",
    "CREATE INDEX IF NOT EXISTS audit_entity_time_idx ON audit_logs(entity, created_at)",
  ];
  for (const sql of statements) {
    await client.execute(sql);
    console.log("✓", sql);
  }
  console.log("索引迁移完成");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
