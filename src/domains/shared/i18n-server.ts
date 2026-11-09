import "server-only";
import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, t, type Lang, type MsgKey } from "./i18n";

/** 요청의 언어 (쿠키, 기본 한국어) */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "ko";
}

/** 서버 컴포넌트용 번역 함수 */
export async function getT() {
  const lang = await getLang();
  return (key: MsgKey, vars?: Record<string, string | number>) => t(lang, key, vars);
}
