// ratcount · 基础字典校验（项目 / 标签 / 币种）/ Validation for basic dictionaries (projects / tags / currencies)
//  - 从 app/actions/* 内联 schema 抽出，供 lib/services/basics 与服务端 action 共用
//  - Extracted from the inline schemas in app/actions/* so lib/services/basics and the server actions share one source
import { z } from "zod";
import { PROJECT_STATUS, projectStatuses } from "@/lib/constants";

/** 项目入参 / Project input */
export const projectSchema = z.object({
  name: z.string().min(1).max(30),
  icon: z.string().max(4).optional(),
  budgetYuan: z.string().optional(),
  status: z.enum(projectStatuses).optional(),
  remark: z.string().max(200).optional(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

/** 标签入参 / Tag input */
export const tagSchema = z.object({
  name: z.string().trim().min(1, "errors.tagNameRequired").max(30),
  color: z.string().max(20).optional(),
  remark: z.string().max(200).optional(),
});
export type TagInput = z.infer<typeof tagSchema>;

/** 币种入参 / Currency input */
export const currencySchema = z.object({
  code: z.string().min(1).max(8),
  symbol: z.string().min(1).max(4),
  name: z.string().min(1).max(60),
  rate: z.string().min(1),
  isActive: z.boolean().optional(),
  remark: z.string().max(200).optional(),
});
export type CurrencyInput = z.infer<typeof currencySchema>;
export type CurrencyUpdateInput = Omit<z.infer<typeof currencySchema>, "code">;
