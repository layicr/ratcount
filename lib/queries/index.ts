/**
 * 查询层统一出口 / Query layer barrel
 *
 * 按领域拆分（原 lib/queries.ts 单文件 746 行 → 8 个模块）：
 *  - 纯逻辑层：lib/period.ts（时间段）、lib/balance.ts（余额增量）
 *  - DB 查询层：accounts / transactions / investments / dashboard / reports / basics / admin
 *
 * 入口路径保持 `@/lib/queries` 不变，34 处调用方零改动。
 * 依赖方向单向：dashboard → accounts/transactions/investments，无循环。
 * Split by domain (was a 746-line lib/queries.ts → 8 modules):
 *  - Pure logic: lib/period.ts (periods), lib/balance.ts (balance delta)
 *  - DB queries: accounts / transactions / investments / dashboard / reports / basics / admin
 * Entry path stays `@/lib/queries`; 34 call sites unchanged. One-way deps: dashboard → accounts/transactions/investments.
 */
export * from "@/lib/period";
export * from "@/lib/balance";
export * from "@/lib/queries/accounts";
export * from "@/lib/queries/transactions";
export * from "@/lib/queries/investments";
export * from "@/lib/queries/dashboard";
export * from "@/lib/queries/reports";
export * from "@/lib/queries/basics";
export * from "@/lib/queries/admin";
