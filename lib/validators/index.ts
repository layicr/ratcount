/**
 * 共享验证 Schema 统一出口 / Shared validation schemas barrel
 *  - 按领域拆分到子文件，此处统一重新导出
 *  - 用法：import { transactionSchema, registerSchema } from "@/lib/validators"
 */
export { transactionSchema, type TransactionInput } from "./transaction";
export { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "./auth";
