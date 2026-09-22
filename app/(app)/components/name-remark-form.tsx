"use client";

import { useTranslations } from "next-intl";
import { ConfirmButton } from "./confirm";

/**
 * 分类 / 标签共用的「新增 / 编辑」表单块（消除 4 处逐字复制）
 *  - picker：左侧取色/取图标控件（由调用方传入，IconPicker 或 ColorPicker）
 *  - onChange：以 patch 形式回写，调用方自行 merge 到自己的 form state
 */
export function NameRemarkForm({
  picker,
  iconLabel,
  name,
  remark,
  onChange,
  namePlaceholder,
  nameLabel,
  remarkLabel,
  action,
  beforeOpen,
  title,
  desc,
  okText,
  onCancel,
  err,
}: {
  picker: React.ReactNode;
  iconLabel?: string;
  name: string;
  remark: string;
  onChange: (patch: { name?: string; remark?: string }) => void;
  namePlaceholder: string;
  nameLabel?: string;
  remarkLabel?: string;
  action: () => Promise<unknown>;
  beforeOpen?: () => boolean;
  title: string;
  desc: string;
  okText: string;
  onCancel: () => void;
  err: string | null;
}) {
  const t = useTranslations();
  return (
    <div className="rounded-2xl border border-teal-200 bg-white p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          {iconLabel && (
            <label className="mb-1 block text-xs font-medium text-slate-600">{iconLabel}</label>
          )}
          {picker}
        </div>
        <div className="flex-1 min-w-[200px] space-y-3">
          <div>
            {nameLabel && (
              <label className="mb-1 block text-xs font-medium text-slate-600">{nameLabel}<span className="text-red-500">*</span></label>
            )}
            <input
              value={name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={namePlaceholder}
              maxLength={30}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            {remarkLabel && (
              <label className="mb-1 block text-xs font-medium text-slate-600">{remarkLabel}</label>
            )}
            <input
              value={remark}
              onChange={(e) => onChange({ remark: e.target.value })}
              placeholder={t("tags.remarkPlaceholder")}
              maxLength={200}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <ConfirmButton action={action} beforeOpen={beforeOpen} title={title} desc={desc} okText={okText}>
            <span className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700">{okText}</span>
          </ConfirmButton>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
      {err && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {t(err, { defaultValue: err })}
        </p>
      )}
    </div>
  );
}
