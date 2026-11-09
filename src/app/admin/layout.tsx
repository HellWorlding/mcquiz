import Link from "next/link";
import { requireAdmin } from "@/domains/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const links = [
    ["/admin", "주제·권한"],
    ["/admin/units", "단원"],
    ["/admin/sources", "스크립트"],
    ["/admin/upload", "문제 업로드"],
    ["/admin/reports", "신고"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1 rounded-xl bg-card p-1 text-sm">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="btn-ghost btn-sm">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
