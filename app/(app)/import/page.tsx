"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type ImportResult = {
  ok: boolean;
  total: number;
  success: number;
  failed: number;
  message: string;
  errors: string[];
};

/** 导入数据页面（三步流程：上传文件 → 检查数据 → 导入数据） */
export default function ImportPage() {
  const t = useTranslations();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function pick(f: File) {
    const okName = /\.(xlsx|csv)$/i.test(f.name);
    if (!okName) {
      setResult({ ok: false, total: 0, success: 0, failed: 0, message: t("errors.onlyXlsx"), errors: [] });
      setStep(3);
      return;
    }
    setFile(f);
    setResult(null);
    setStep(2);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pick(f);
  }

  async function doImport() {
    if (!file || busy) return;
    setBusy(true);
    setStep(3);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      setResult({
        ok: r.ok,
        total: j.total ?? 0,
        success: j.success ?? 0,
        failed: j.failed ?? 0,
        message: j.message ?? t("profile.importDone"),
        errors: Array.isArray(j.errors) ? j.errors : [],
      });
    } catch {
      setResult({ ok: false, total: 0, success: 0, failed: 0, message: t("profile.importDone"), errors: [] });
    }
    setBusy(false);
  }

  function reset() {
    setFile(null);
    setResult(null);
    setStep(1);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const steps: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: t("profile.importStepUpload") },
    { n: 2, label: t("profile.importStepCheck") },
    { n: 3, label: t("profile.importStepDo") },
  ];
  const fmtSize = (b: number) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* 头部：标题 + 返回 + 导入按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            ← {t("profile.importClose")}
          </button>
          <h1 className="text-lg font-bold text-slate-900">{t("profile.importTitle")}</h1>
        </div>
        <button
          type="button"
          onClick={doImport}
          disabled={!file || busy}
          className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t("profile.importImporting") : t("profile.importBtn")}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        {/* 步骤条 */}
        <div className="flex items-center px-5 pt-5">
          {steps.map((s, i) => {
            const done = s.n < step;
            const active = s.n === step;
            return (
              <div key={s.n} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
                {i > 0 && <div className={`mx-2 h-0.5 flex-1 rounded ${done || active ? "bg-teal-500" : "bg-slate-200"}`} />}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      done ? "bg-teal-500 text-white" : active ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {done ? "✓" : s.n}
                  </span>
                  <span className={`text-xs ${active ? "font-semibold text-teal-700" : done ? "text-slate-600" : "text-slate-400"}`}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 主体 */}
        <div className="px-5 py-6">
          {step === 1 && (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                dragOver ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/50"
              }`}
            >
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={dragOver ? "#0d9488" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <p className={`mt-3 text-sm ${dragOver ? "text-teal-700" : "text-slate-600"}`}>{t("profile.importDropHint")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("profile.importFormatHint")}</p>
            </div>
          )}

          {step === 2 && file && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-lg shadow-sm">
                  {/\.csv$/i.test(file.name) ? "📄" : "📊"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t("profile.importSelected")} · {fmtSize(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {t("profile.importReselect")}
                </button>
              </div>
              <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-500">
                {t("profile.importTemplateHint")}
              </p>
            </div>
          )}

          {step === 3 && (
            <div>
              {busy ? (
                <div className="flex flex-col items-center py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                  <p className="mt-3 text-sm text-slate-500">{t("profile.importImporting")}</p>
                </div>
              ) : result ? (
                <div className="space-y-3">
                  <div
                    className={`rounded-xl px-4 py-3 text-sm font-medium ${
                      result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {result.message}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 px-4 py-3 text-center">
                      <p className="text-lg font-bold text-teal-600">{t("profile.importSuccess", { success: result.success })}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3 text-center">
                      <p className={`text-lg font-bold ${result.failed > 0 ? "text-red-500" : "text-slate-400"}`}>
                        {t("profile.importFailed", { failed: result.failed })}
                      </p>
                    </div>
                  </div>
                  {result.errors.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-red-100 bg-red-50/50 p-3">
                      <p className="text-xs font-semibold text-red-500">{t("profile.importErrorList")}</p>
                      <ul className="mt-1.5 space-y-1">
                        {result.errors.map((e, i) => (
                          <li key={i} className="text-xs text-slate-600">{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={reset}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      {t("profile.importReselect")}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="flex-1 rounded-lg bg-teal-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-teal-700"
                    >
                      {t("profile.importDone")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* 底部：模板下载 */}
        <div className="flex items-center justify-between rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <p className="text-xs text-slate-500">{t("profile.importTemplateHint")}</p>
          <a
            href="/api/import/template"
            download
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50"
          >
            {t("profile.importDownloadTemplate")}
          </a>
        </div>
      </div>

      {/* 隐藏文件选择框 */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
