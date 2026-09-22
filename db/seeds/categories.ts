/** 分类定义数据（seed 专用）/ Category definitions (seed-only) */
export type CatDef = {
  name: string;
  type: "income" | "expense";
  icon: string;
};

/** 演示用分类列表（与 HIST_TX 的 cat 字段对应）/ Demo category list (matches HIST_TX.cat) */
export const CAT_DEFS: CatDef[] = [
  { name: "工资",          type: "income",   icon: "💰" },
  { name: "生意进账",      type: "income",   icon: "🧋" },
  { name: "投资收益",      type: "income",   icon: "📈" },
  { name: "其他收入",      type: "income",   icon: "📦" },
  { name: "房贷",          type: "expense",  icon: "🏠" },
  { name: "宝宝",          type: "expense",  icon: "👶" },
  { name: "餐饮",          type: "expense",  icon: "🍚" },
  { name: "医疗",          type: "expense",  icon: "🏥" },
  { name: "交通",          type: "expense",  icon: "🚗" },
  { name: "教育",          type: "expense",  icon: "📚" },
  { name: "娱乐",          type: "expense",  icon: "🎬" },
  { name: "其他",          type: "expense",  icon: "📦" },
  { name: "消费型保险",    type: "expense",  icon: "☂️" },
];
