"use client";

import Link from "next/link";
import { useT } from "@/components/i18n-provider";

/** 导入数据按钮：点击跳转到导入数据页面 */
export function ImportButton() {
  const t = useT();
  return (
    <Link
      href="/import"
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
    >
      {t("profile.import")}
    </Link>
  );
}
