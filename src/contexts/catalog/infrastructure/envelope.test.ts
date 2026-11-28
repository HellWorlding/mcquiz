import { describe, expect, it } from "vitest";
import { decodeEnvelope, encodeEnvelope } from "./envelope";

const SQL = "CREATE TABLE emp (id int PRIMARY KEY, name varchar(20)); INSERT INTO emp VALUES (1, 'a'); DELETE FROM emp WHERE id = 1 OR 1=1; SELECT name FROM emp UNION SELECT password FROM users; -- '; DROP TABLE emp;";

describe("반입 봉투 (ImportEnvelope)", () => {
  it("한글·SQL·HTML·이모지·제어문자가 든 값을 왕복하고, 봉투에는 base64 글자만 남는다", () => {
    const value = { subject_id: "s", inserts: [{ prompt: `다음 SQL 의 결과는? ${SQL}`, choices: [{ ord: 1, text: "<script>alert(1)</script>", explanation: "해설 😀\t\n\u0001" }] }], updates: [] };
    const env = encodeEnvelope(value);
    expect(env).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(env).not.toContain("SELECT");
    expect(decodeEnvelope(env)).toEqual(value);
  });
  it("긴 본문(50KB 이상)도 그대로 왕복", () => {
    const prompt = Array.from({ length: 300 }, (_, i) => `${i}: ${SQL}`).join("\n");
    expect(prompt.length).toBeGreaterThan(50_000);
    expect(decodeEnvelope<{ prompt: string }>(encodeEnvelope({ prompt }))?.prompt).toBe(prompt);
  });
  it("M5 base64 아님·UTF-8 아님·JSON 아님이면 null", () => {
    expect(decodeEnvelope("not base64!")).toBeNull();
    expect(decodeEnvelope("abc")).toBeNull(); // 길이가 4의 배수가 아님
    expect(decodeEnvelope(Buffer.from([0xff, 0xfe, 0xfd]).toString("base64"))).toBeNull();
    expect(decodeEnvelope(Buffer.from("{not json", "utf8").toString("base64"))).toBeNull();
  });
});
