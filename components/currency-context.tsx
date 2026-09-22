"use client";

import { createContext, useContext } from "react";
import { useLocale } from "next-intl";
import { formatCurrency } from "@/lib/money";
import { DEFAULT_CURRENCY } from "@/lib/constants";

/** 当前账本基础币种上下文：由 AppShell 注入，客户端组件用它做 locale 感知的金额格式化 */
const CurrencyContext = createContext<string>(DEFAULT_CURRENCY);

export function CurrencyProvider({
  currency,
  children,
}: {
  currency: string;
  children: React.ReactNode;
}) {
  return (
    <CurrencyContext.Provider value={currency}>
      {children}
    </CurrencyContext.Provider>
  );
}

/** 客户端取当前账本基础币种（默认 CNY） */
export function useBaseCurrency(): string {
  return useContext(CurrencyContext);
}

/** 客户端金额格式化：结合账本币种 + 当前 locale，返回 (分) => 本地化货币串 */
export function useMoney() {
  const cur = useBaseCurrency();
  const locale = useLocale();
  return (cents: number) => formatCurrency(cents, cur, locale);
}
