import { z } from "zod";

/**
 * 认证验证 Schema / Auth validation schema
 *  - 注册、登录共用 / Shared by register & login
 */

/** 注册入参 schema / Register input schema */
export const registerSchema = z.object({
  name: z.string().min(1).max(30),
  email: z.string().email(),
  password: z.string().min(6).max(72),
  captcha: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** 登录入参 schema / Login input schema */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captcha: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
