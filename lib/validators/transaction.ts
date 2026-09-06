import { z } from "zod";

/**
 * 交易验证 Schema / Transaction validation schema
 *  - 前后端共用，修改字段只需改一处
 */

/** 交易入参 schema */
export const transactionSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  accountId: z.string().min(1),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  projectId: z.string().optional(),
  amountYuan: z.string().min(1),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remark: z.string().max(200).optional(),
  tagIds: z.array(z.string()).optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

/**
 * 流水列表筛选 type 的 zod 白名单校验
 *  - 允许值：income / expense / transfer / 空串("全部")
 *  - 非法或缺失值回退为空串(即不过滤)
 *  - 复用 transactionSchema 的 type 枚举，保持单一来源
 */
export const txTypeFilterSchema = transactionSchema.shape.type
  .or(z.literal(""))
  .catch("");

/** 筛选 type 解析结果类型 */
export type TxTypeFilter = z.infer<typeof txTypeFilterSchema>;

/**
 * 流水列表全部筛选参数的 zod 白名单/格式预校验
 *  - page / pageSize 由分页 helper 单独校验，这里只覆盖筛选维度
 *  - 非法或缺失值统一回退为 undefined / 空串（即不过滤），杜绝脏值透传到 SQL
 *  - 复用 transactionSchema 的 type 枚举；ID 与 db/schema 的 randomUUID 保持一致
 */
export const txListFilterSchema = z.object({
  type: txTypeFilterSchema,
  categoryId: z.string().uuid().optional().catch(undefined),
  accountId: z.string().uuid().optional().catch(undefined),
  projectId: z.string().uuid().optional().catch(undefined),
  q: z.string().transform((s) => s.slice(0, 200)).optional().catch(undefined),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  // 非负小数，最多 2 位（与输入框 step=0.01 对齐）；非法值回退为空（不过滤）
  minAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().catch(undefined),
  maxAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().catch(undefined),
});

/** 列表筛选解析结果类型 */
export type TxListFilter = z.infer<typeof txListFilterSchema>;
