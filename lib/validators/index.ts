/**
 * 共享验证 Schema 统一出口 / Shared validation schemas barrel
 *  - 按领域拆分到子文件，此处统一重新导出
 *  - 用法：import { transactionSchema, registerSchema } from "@/lib/validators"
 * Split by domain into sub-files; re-exported here. Usage: import { transactionSchema, registerSchema } from "@/lib/validators".
 */
export { transactionSchema, txTypeFilterSchema, txListFilterSchema, type TransactionInput, type TxTypeFilter, type TxListFilter } from "./transaction";
export { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "./auth";
export { projectSchema, tagSchema, currencySchema, type ProjectInput, type TagInput, type CurrencyInput, type CurrencyUpdateInput } from "./basics";
