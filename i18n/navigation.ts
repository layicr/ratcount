import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** 与 next-intl routing 绑定的导航原语（后续若要改路径级 locale 可直接复用） */
export const { Link, redirect, useRouter, usePathname } = createNavigation(routing);
