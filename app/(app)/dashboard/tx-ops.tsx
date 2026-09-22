"use client";

import { copyTransaction, deleteTransaction } from "@/app/actions/transactions";
import { useTranslations } from "next-intl";
import { ConfirmButton, useToast } from "../components/confirm";

/** 流水行操作：复制（周期账单重复）+ 删除，均带确认框（i18n） */
export function TxOps({ tx }: { tx: { id: string } }) {
  const t = useTranslations();
  const toast = useToast();
  return (
    <div className="flex justify-end gap-1">
      <ConfirmButton
        action={async () => {
          const r = await copyTransaction(tx.id);
          if (r.ok) toast(t("tx.copyOk"));
          else toast(t(r.error));
        }}
        title={t("tx.copyTitle")}
        desc={t("tx.copyDesc")}
        okText={t("common.copy")}
      >
        <span className="text-xs text-teal-600 hover:underline">{t("common.copy")}</span>
      </ConfirmButton>
      <ConfirmButton
        danger
        action={async () => {
          await deleteTransaction(tx.id);
        }}
        title={t("tx.delTitle")}
        desc={t("tx.delDesc")}
        okText={t("common.delete")}
      >
        <span className="text-xs text-red-500 hover:underline">{t("common.delete")}</span>
      </ConfirmButton>
    </div>
  );
}
