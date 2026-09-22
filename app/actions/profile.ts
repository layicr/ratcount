"use server";

// ratcount · 个人资料写操作（薄封装）/ Profile writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/profile；此处仅做守卫，服务端行为零回归。
import { requireUser } from "@/lib/scope";
import * as svc from "@/lib/services/profile";

export async function updateUserName(name: string) {
  const user = await requireUser();
  return svc.updateUserNameService({ id: user.id, role: user.role, name: user.name }, name);
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const user = await requireUser();
  return svc.changePasswordService({ id: user.id, role: user.role }, oldPassword, newPassword);
}
