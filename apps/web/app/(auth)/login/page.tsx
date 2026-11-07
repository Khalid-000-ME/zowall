import { redirect } from "next/navigation";

import { LoginForm } from "@/components/account/AuthForms";
import { currentAccount } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in to Zowall" };

export default async function Login() {
  if (await currentAccount()) redirect("/app");
  return <LoginForm passwordLogin={process.env["ALLOW_PASSWORD_LOGIN"] === "true"} />;
}
