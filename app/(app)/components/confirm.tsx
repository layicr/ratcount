"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useT } from "@/components/i18n-provider";

/**
 * 通用确认按钮：所有写操作（删除/批量删除/复制/退出等）执行前必须确认
 *  - action：调用 server action 的闭包
 *  - danger：红色危险态（删除类）
 */
export function ConfirmButton({
  action,
  title,
  desc,
  okText,
  danger,
  children,
  className,
  disabled,
  beforeOpen,
}: {
  action: () => Promise<unknown>;
  title: string;
  desc: string;
  okText?: string;
  danger?: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  /** 点击后、弹框前的前置校验；返回 false 则不弹确认框（用于表单校验） */
  beforeOpen?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const t = useT();

  function handleClick() {
    if (beforeOpen && !beforeOpen()) return;
    setOpen(true);
  }

  function run() {
    start(async () => {
      try {
        await action();
        setOpen(false);
      } catch {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={className}
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-center">
              <div
                className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold ${
                  danger
                    ? "bg-red-100 text-red-600"
                    : "bg-teal-100 text-teal-700"
                }`}
              >
                {danger ? "!" : "✓"}
              </div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-500">{desc}</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={run}
                disabled={pending}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-teal-600 hover:bg-teal-700"
                }`}
              >
                {pending ? t("common.processing") : okText || t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 通用删除按钮：危险态确认（封装 ConfirmButton danger），消除各 manager 的重复删除块 */
export function DeleteButton({
  action,
  title,
  desc,
  label,
  okText,
  disabled,
  beforeOpen,
}: {
  action: () => Promise<unknown>;
  title: string;
  desc: string;
  label: React.ReactNode;
  okText?: string;
  disabled?: boolean;
  beforeOpen?: () => boolean;
}) {
  return (
    <ConfirmButton danger action={action} title={title} desc={desc} okText={okText} disabled={disabled} beforeOpen={beforeOpen}>
      {label}
    </ConfirmButton>
  );
}

/* ================= 全局轻提示 Toast（替代原生 alert，界面更友好） ================= */

let toastShow: ((msg: string) => void) | null = null;

/** 轻提示 hook：返回 (msg)=>void，调用后右下角弹出自动消失 */
export function useToast() {
  return (msg: string) => {
    toastShow?.(msg);
  };
}

/** Toast 宿主：挂载到根布局一次，负责渲染消息浮层 */
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    toastShow = (m) => {
      setMsg(m);
      setTick((n) => n + 1);
    };
    return () => {
      toastShow = null;
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setMsg(null), 2600);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [msg, tick]);

  if (!msg) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-xl bg-slate-900/90 px-4 py-2.5 text-sm text-white shadow-xl"
    >
      {msg}
    </div>
  );
}
