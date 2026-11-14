import { describe, expect, it } from "vitest";
import { plainText } from "./plain";

describe("plainText", () => {
  it("굵게를 따옴표로 바꾼다", () => {
    expect(plainText("정답은 **3번, 3**입니다.")).toBe("정답은 '3번, 3'입니다.");
  });
  it("코드 울타리와 머리글을 지운다", () => {
    expect(plainText("## 핵심\n```python\ndf.loc[0:2]\n```\n끝")).toBe("핵심\ndf.loc[0:2]\n끝");
  });
  it("백틱 인라인 코드는 그대로 둔다", () => {
    expect(plainText("`loc`은 끝값 포함")).toBe("`loc`은 끝값 포함");
  });
});
