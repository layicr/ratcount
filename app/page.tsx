import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/constants";

/** 首页：直接跳转到登录页 / Home → login */
export default function Home() {
  redirect(LOGIN_PATH);
}
