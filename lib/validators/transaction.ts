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
