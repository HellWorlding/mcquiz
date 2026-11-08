import { requireUser } from "@/domains/auth/session";
import { PasswordForm } from "@/domains/auth/components/PasswordForm";

export const metadata = { title: "내 계정" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  return (
    <section className="mx-auto mt-6 flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">내 계정</h1>
      <PasswordForm email={user.email} />
    </section>
  );
}
