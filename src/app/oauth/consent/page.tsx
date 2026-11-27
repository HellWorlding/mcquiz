import { redirect } from "next/navigation";
import { requireUser } from "@/domains/auth/session";
import { createClient } from "@/domains/auth/supabase/server";
import { ConsentForm } from "@/domains/mcp/components/ConsentForm";

export const metadata = { title: "앱 연결 허용" };

/**
 * OAuth 2.1 동의 화면. Supabase Auth 가 ?authorization_id= 로 여기로 보낸다.
 * 로그인한 사용자가 "이 앱(Claude, ChatGPT 등)이 내 계정으로 mcquiz 를 쓰게 할지" 결정한다.
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: id } = await searchParams;
  if (!id) redirect("/");
  await requireUser(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`);
  const db = await createClient();
  const { data, error } = await db.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) {
    return (
      <section className="mx-auto mt-10 max-w-sm">
        <p className="card text-bad">요청을 확인할 수 없습니다. {error?.message ?? ""}</p>
      </section>
    );
  }
  // 이미 허용한 앱이면 바로 돌려보낸다
  if (!("authorization_id" in data)) redirect(data.redirect_url);
  return (
    <section className="mx-auto mt-10 max-w-sm">
      <ConsentForm authorizationId={data.authorization_id} clientName={data.client.name} clientUri={data.client.uri} scopes={(data.scope ?? "").split(" ").filter(Boolean)} email={data.user.email} />
    </section>
  );
}
