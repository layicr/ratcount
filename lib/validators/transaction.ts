import { z } from "zod";
import { transactionTypes } from "@/lib/constants";

/**
 * 交易验证 Schema / Transaction validation schema
 *  - 前后端共用，修改字段只需改一处 / Shared by front & back end; one place to change fields
 */

/** 交易入参 schema / Transaction input schema */
export const transactionSchema = z.object({
  // 交易类型枚举由 db/schema 的 transactionTypes 派生，避免与 schema 出现第二真源 / Type enum derives from db/schema's transactionTypes — no second source of truth
  type: z.enum(transactionTypes),
  accountId: z.string().min(1),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  projectId: z.string().optional(),
  // 金额：字符串形式（元），长度上限 20 位；具体合法性 + 上限由 yuanToCents（MAX_ABS_CENTS）兜底 / Amount: string (yuan), max 20 chars; validity + cap enforced by yuanToCents (MAX_ABS_CENTS)
  amountYuan: z.string().min(1).max(20),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remark: z.string().max(200).optional(),
  tagIds: z.array(z.string()).optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

/**
 * 流水列表筛选 type 的 zod 白名单校验 / zod whitelist for the list "type" filter
 *  - 允许值：income / expense / transfer / 空串("全部") / allowed: income / expense / transfer / "" (all)
 *  - 非法或缺失值回退为空串(即不过滤) / invalid/missing → "" (no filter)
 *  - 复用 transactionSchema 的 type 枚举，保持单一来源 / reuses transactionSchema.type enum (single source)
 */
export const txTypeFilterSchema = transactionSchema.shape.type
  .or(z.literal(""))
  .catch("");

/** 筛选 type 解析结果类型 / Parsed type-filter result */
export type TxTypeFilter = z.infer<typeof txTypeFilterSchema>;

const uuidSchema = z.string().uuid();

/**
 * 多选 ID 过滤（如账户多选）：URL 中同名参数可重复出现（?accountIds=a&accountIds=b）
 *  - 逐个做 UUID 白名单校验，非法项直接丢弃（不因单个脏值失效整个筛选）
 *  - 去重；缺失/全非法时返回空数组（即不过滤）
 * Multi-select ID filter (e.g. accounts): same-named param may repeat in URL (?accountIds=a&accountIds=b).
 *  - Per-item UUID whitelist; invalid items dropped (one dirty value won't void the whole filter)
 *  - Dedup; missing/all-invalid → empty array (no filter)
 */
const idListFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .catch(undefined)
  .transform((v) => {
    if (v === undefined) return [] as string[];
    const arr = Array.isArray(v) ? v : [v];
    return [...new Set(arr.filter((s) => uuidSchema.safeParse(s).success))];
  });

/**
 * 流水列表全部筛选参数的 zod 白名单/格式预校验 / zod whitelist/format pre-check for all list filters
 *  - page / pageSize 由分页 helper 单独校验，这里只覆盖筛选维度 / page/pageSize validated by the pagination helper; only filters here
 *  - 非法或缺失值统一回退为 undefined / 空串（即不过滤），杜绝脏值透传到 SQL / invalid/missing → undefined / "" (no filter), never leaking dirty values into SQL
 *  - 复用 transactionSchema 的 type 枚举；ID 与 db/schema 的 randomUUID 保持一致 / reuses transactionSchema.type enum; IDs match db/schema randomUUID
 */
export const txListFilterSchema = z.object({
  type: txTypeFilterSchema,
  categoryId: z.string().uuid().optional().catch(undefined),
  accountId: z.string().uuid().optional().catch(undefined),
  // 账户多选（追加条件查询）：与单选 accountId 并存，查询层合并为 OR 条件 / Multi-select accounts (extra filter): coexists with single accountId, merged as OR in the query layer
  accountIds: idListFilterSchema,
  projectId: z.string().uuid().optional().catch(undefined),
  q: z.string().transform((s) => s.slice(0, 200)).optional().catch(undefined),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  // 非负小数，最多 2 位（与输入框 step=0.01 对齐）；非法值回退为空（不过滤）/ Non-negative decimal, ≤2 dp (matches input step=0.01); invalid → "" (no filter)
  minAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().catch(undefined),
  maxAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().catch(undefined),
});

/** 列表筛选解析结果类型 / Parsed list-filter result */
export type TxListFilter = z.infer<typeof txListFilterSchema>;
