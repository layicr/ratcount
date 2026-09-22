import type { DefaultSession } from "next-auth";
import type { UserRole,ROLE } from "@/lib/constants";

/** Auth.js 类型扩展（独立 d.ts，避免内联 augmentation 模块解析问题）；
 * role 统一收口为 UserRole（"admin" | "user"），与 db/users.role 对齐
 * tokenVersion 与 db/users.token_version 对齐：会话侧比对以实现 JWT 吊销 */
declare module "next-auth" {
  interface Session {
    user: { id: string; role: UserRole; tokenVersion?: number } & DefaultSession[ROLE.user];
  }
  interface User {
    role?: UserRole;
    tokenVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    tokenVersion?: number;
  }
}

export {};
