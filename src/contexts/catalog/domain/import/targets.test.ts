import { describe, expect, it } from "vitest";
import { unitNoFromTitle } from "./targets";
import { unitLabel } from "@/shared/labels";

describe("unitNoFromTitle", () => {
  it("기존 표기", () => {
    expect(unitNoFromTitle("파트3")).toBe(3);
    expect(unitNoFromTitle("Unit 7: Character")).toBe(7);
    expect(unitNoFromTitle("12강 학교 경영")).toBe(12);
  });
  it("점 번호: 마지막 자리를 번호로", () => {
    expect(unitNoFromTitle("1. 머신러닝 기초")).toBe(1);
    expect(unitNoFromTitle("1.3 평가 지표")).toBe(3);
    expect(unitNoFromTitle("11.2 SQL")).toBe(2);
    expect(unitNoFromTitle("Learning")).toBeNull();
  });
});

describe("unitLabel", () => {
  it("번호가 이미 있는 제목은 그대로", () => {
    expect(unitLabel(3, "1.3 평가 지표")).toBe("1.3 평가 지표");
    expect(unitLabel(7, "Unit 7: Character")).toBe("Unit 7: Character");
  });
  it("번호가 없는 제목에는 붙인다", () => {
    expect(unitLabel(3, "학교 경영")).toBe("3강 - 학교 경영");
    expect(unitLabel(2, "Appearance")).toBe("2. Appearance");
  });
});
