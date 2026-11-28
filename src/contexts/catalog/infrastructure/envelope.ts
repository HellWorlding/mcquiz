import { Buffer } from "node:buffer";

/**
 * 반입 봉투 (ImportEnvelope). 저장할 문항을 UTF-8 JSON → base64 한 덩어리로 감싼다.
 * Supabase 앞단 WAF 가 문항 본문의 SQL 문장·HTML 을 공격 패턴으로 보고 막지 못하게 하는 운반 형식일 뿐이다.
 * 판정(검증·중복)은 봉투 바깥(application)에서 끝난다. DB 함수 catalog.apply_import 가 풀어서 저장한다.
 */
export function encodeEnvelope(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

/** encodeEnvelope 의 역. base64·UTF-8·JSON 이 아니면 null (예외를 던지지 않는다) */
export function decodeEnvelope<T = unknown>(payload: string): T | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 !== 0) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(payload, "base64"));
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
