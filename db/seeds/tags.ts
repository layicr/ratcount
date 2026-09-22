/** 标签定义数据（seed 专用）/ Tag definitions (seed-only) */
export type TagDef = {
  name: string;
  color: string;
};

/** 演示用标签列表（与事务 remark 字段对应）/ Demo tag list (matches transaction remark fields) */
export const TAG_DEFS: TagDef[] = [
  { name: "宝宝",  color: "#EA6668" },
  { name: "康复",  color: "#C9A7E8" },
  { name: "出差",  color: "#F4B393" },
  { name: "房贷",  color: "#8BC8EA" },
  { name: "投资",  color: "#A2DDAA" },
  { name: "保险",  color: "#F2C14E" },
  { name: "公积金", color: "#7FD6A8" },
];
