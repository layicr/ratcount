"use server";

// ratcount · 个人资料写操作（薄封装）/ Profile writes (thin wrapper)
//  - 写逻辑已抽到 lib/services/profile；此处仅做守卫，服务端行为零回归。
import { requireUser } from "@/lib/scope";
import * as svc from "@/lib/services/profile";

// 更新昵称（需登录）/ Update display name (signed-in)
export async function updateUserName(name: string) {
  const user = await requireUser();
  return svc.updateUserNameService({ id: user.id, role: user.role, name: user.name }, name);
}

// 修改密码（需登录；校验旧密码）/ Change password (signed-in; verifies old password)
export async function changePassword(oldPassword: string, newPassword: string) {
  const user = await requireUser();
  return svc.changePasswordService({ id: user.id, role: user.role }, oldPassword, newPassword);
}
