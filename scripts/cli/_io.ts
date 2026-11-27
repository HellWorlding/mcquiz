/** CLI 출력·종료 규약: 실패는 stderr 한 줄 + 종료 코드 1. 성공은 마지막에 한 줄 요약 */

export function fail(message: string): never {
  console.error(`오류: ${message}`);
  process.exit(1);
}

export function summary(line: string): void {
  console.log(line);
}

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export const secs = (fromMs: number) => `${Math.round((Date.now() - fromMs) / 1000)}초`;

/** 한 줄로 줄이고 길이를 제한한다 (파일 내용·질문문을 로그에 길게 찍지 않기 위해) */
export const short = (s: string, n = 100) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

export type Parsed = { positional: string[]; flags: Set<string>; options: Record<string, string> };

/**
 * `--name value` (withValue 에 있는 이름) / `--name=value` / `--flag` 를 나눈다. 나머지는 positional.
 * 숫자 등 값이 `--` 로 시작하지 않는 한 그대로 받는다.
 */
export function parseArgs(argv: string[], withValue: string[] = []): Parsed {
  const positional: string[] = [];
  const flags = new Set<string>();
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      options[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    if (withValue.includes(body)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) fail(`--${body} 뒤에 값이 필요합니다.`);
      options[body] = v;
      i++;
    } else flags.add(body);
  }
  return { positional, flags, options };
}

export function intOption(p: Parsed, name: string, fallback: number | null): number | null {
  const raw = p.options[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) fail(`--${name} 은 정수여야 합니다.`);
  return n;
}
