"use server";

// ratcount · 用户偏好（读保留，写抽服务）/ User preferences (read kept, write delegated)
//  - updateUserPreferences 的写逻辑已抽到 lib/services/profile；getUserPreferences 为读，服务端/桌面读路径共用。
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/scope";
import { userProfiles } from "@/db/schema";
import * as svc from "@/lib/services/profile";
import type { UserPreferenceInput } from "@/lib/services/profile";

export async function getUserPreferences() {
  const user = await requireUser();
  const [p] = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1);
  return p ?? null;
}

export async function updateUserPreferences(input: UserPreferenceInput) {
  const user = await requireUser();
  return svc.updateUserPreferencesService({ id: user.id, role: user.role }, input);
}
