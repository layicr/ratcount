import type { DefaultSession } from "next-auth";

/** Auth.js 类型扩展（独立 d.ts，避免内联 augmentation 模块解析问题） */
declare module "next-auth" {
  interface Session {
    user: { id: string; role: string } & DefaultSession["user"];
  }
  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}

export {};
