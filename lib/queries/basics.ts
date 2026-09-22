/**
 * 基础字典查询 / Basic dictionary queries
 *  - listRecurringPlans：周期计划（保障页「缴费计划」用）
 *  - listTags：标签（投资动作打标用）
 *  - listProjects：项目（投资绑定用）
 */
import { tags, recurringPlans, projects } from "@/db/schema"
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";




/** 周期计划列表（保障页「缴费计划」用）/ Recurring plan list (protection page "payment plans") */
export async function listRecurringPlans(ledgerId: string) {
  return db
    .select()
    .from(recurringPlans)
    .where(eq(recurringPlans.ledgerId, ledgerId))
    .orderBy(asc(recurringPlans.nextDate));
}

/** 标签列表（投资动作打标用）/ Tag list (for tagging investment actions) */
export async function listTags(ledgerId: string) {
  return db
    .select()
    .from(tags)
    .where(eq(tags.ledgerId, ledgerId))
    .orderBy(asc(tags.name));
}

/** 项目列表（投资绑定用，仅返回 id/name/icon）/ Project list (for investment binding; returns id/name/icon only) */
export async function listProjects(ledgerId: string) {
  return db
    .select({ id: projects.id, name: projects.name, icon: projects.icon })
    .from(projects)
    .where(eq(projects.ledgerId, ledgerId))
    .orderBy(asc(projects.name));
}
