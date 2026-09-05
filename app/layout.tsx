import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n";
import { I18nProvider } from "@/components/i18n-provider";

/** 根布局标题 / Root layout title（不含 SEO 元信息） */
export const metadata: Metadata = {
  title: "ratcount · bookkeeping",
};

/** 根布局：注入 i18n Provider（服务端读 cookie 语言）/ Root layout shell */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale === "en" ? "en" : "zh-CN"}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
