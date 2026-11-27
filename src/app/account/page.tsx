import { requireUser } from "@/contexts/access/server";
import { PasswordForm } from "@/contexts/access/ui/components/PasswordForm";
import { getT } from "@/shared/i18n/server";
import { McpConnectCard } from "@/contexts/integration/ui";
import { headers } from "next/headers";

export const metadata = { title: "내 계정" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const t = await getT();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "mcquiz.site";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return (
    <section className="mx-auto mt-6 flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("account.title")}</h1>
      <PasswordForm email={user.email} />
      <McpConnectCard url={`${proto}://${host}/api/mcp`} />
    </section>
  );
}
