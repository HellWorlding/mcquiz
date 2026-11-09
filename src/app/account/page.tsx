import { requireUser } from "@/domains/auth/session";
import { PasswordForm } from "@/domains/auth/components/PasswordForm";
import { getT } from "@/domains/shared/i18n-server";

export const metadata = { title: "내 계정" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const t = await getT();
  return (
    <section className="mx-auto mt-6 flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("account.title")}</h1>
      <PasswordForm email={user.email} />
    </section>
  );
}
