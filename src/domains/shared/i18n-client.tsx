"use client";
import { createContext, useContext } from "react";
import { t, type Lang, type MsgKey } from "./i18n";

const LangContext = createContext<Lang>("ko");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext value={lang}>{children}</LangContext>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** 클라이언트 컴포넌트용 번역 함수 */
export function useT() {
  const lang = useContext(LangContext);
  return (key: MsgKey, vars?: Record<string, string | number>) => t(lang, key, vars);
}
