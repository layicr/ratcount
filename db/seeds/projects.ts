/** 项目定义数据（seed 专用）/ Project definitions (seed-only) */
import type { ProjectStatus } from "../../lib/constants";

export type ProjectDef = {
  name: string;
  icon: string;
  /** 预算（分）/ budget (cents) */
  budgetCents: number;
  /** active / completed */
  status: ProjectStatus;
};

/** 演示用项目列表（与 HIST_TX 的 project 字段对应）/ Demo project list (matches HIST_TX.project) */
export const PROJECT_DEFS: ProjectDef[] = [
  { name: "奶茶店",   icon: "🧋", budgetCents: 5000000, status: "active" },
  { name: "宝贝计划", icon: "👶", budgetCents: 1500000, status: "completed" },
];
