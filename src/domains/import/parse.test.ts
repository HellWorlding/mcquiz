import { describe, expect, it } from "vitest";
import { mergeAnswerKey, parseQuestionText, unitNoFromFilename } from "./parse-text";
import { parseJsonQuestions } from "./parse-json";

describe("복기 메모 형식", () => {
  it("'1 선지' 스타일, 정답 없음", () => {
    const r = parseQuestionText(`
1. 문서관리 업무의 범위가 아닌 것은?
1 기안
2 공람
3 발송함
4 과제카드

2. 다음 중 옳은 것은?
1 가
2 나
3 다
4 라
정답: 3
`);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].prompt).toBe("문서관리 업무의 범위가 아닌 것은?");
    expect(r.questions[0].choices.map((c) => c.text)).toEqual(["기안", "공람", "발송함", "과제카드"]);
    expect(r.questions[0].correct).toBeNull();
    expect(r.questions[0].warnings[0]).toContain("정답이 없습니다");
    expect(r.questions[1].correct).toBe(3);
  });

  it("원문자 ①②③④ 와 (1) 스타일, 5지선다", () => {
    const r = parseQuestionText(`
1. 다음 중 틀린 것은? [26강]
① 하나
② 둘
③ 셋
④ 넷
⑤ 다섯
2. 두 번째 문제는?
(1) a
(2) b
(3) c
(4) d
`);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].choices).toHaveLength(5);
    expect(r.questions[0].unitHint).toBe(26);
    expect(r.questions[0].prompt).toBe("다음 중 틀린 것은?");
    expect(r.questions[1].choices.map((c) => c.text)).toEqual(["a", "b", "c", "d"]);
  });

  it("줄바꿈이 깨져 한 줄에 붙은 경우", () => {
    const r = parseQuestionText(
      `1. 첫 문제는? ① 가 ② 나 ③ 다 ④ 라 2. 둘째 문제는? 1) 에 2) 비 3) 씨 4) 디 3. 셋째는? (1) x (2) y (3) z (4) w`,
    );
    expect(r.questions).toHaveLength(3);
    expect(r.questions[0].choices.map((c) => c.text)).toEqual(["가", "나", "다", "라"]);
    expect(r.questions[1].choices.map((c) => c.text)).toEqual(["에", "비", "씨", "디"]);
    expect(r.questions[2].prompt).toBe("셋째는?");
    expect(r.questions[2].choices.map((c) => c.text)).toEqual(["x", "y", "z", "w"]);
  });

  it("단원 머리글 [9강] 이 이후 문항에 적용된다", () => {
    const r = parseQuestionText(`
[1강] 학교 경영
1. 가?
1) a
2) b
3) c
4) d
[9강] 장학
2. 나?
1) a
2) b
3) c
4) d
`);
    expect(r.questions.map((q) => q.unitHint)).toEqual([1, 9]);
  });

  it("선지 본문이 여러 줄로 이어진다", () => {
    const r = parseQuestionText(`
1. 질문?
1) 첫 줄
   이어지는 둘째 줄
2) 둘
3) 셋
4) 넷
`);
    expect(r.questions[0].choices[0].text).toBe("첫 줄 이어지는 둘째 줄");
  });

  it("같은 파일 안에 정답·해설이 들어 있는 경우", () => {
    const r = parseQuestionText(`
1. 질문?
1) 가
2) 나
3) 다
4) 라
정답: 2번
해설: 나가 맞다

2. 둘째?
1) a
2) b
3) c
4) d
정답 ④
`);
    expect(r.questions[0].correct).toBe(2);
    expect(r.questions[0].explanation).toBe("나가 맞다");
    expect(r.questions[1].correct).toBe(4);
  });
});

describe("문제지 + 정답지", () => {
  it("별도 정답지의 정답과 선지별 해설을 병합한다", () => {
    const q = parseQuestionText(`
1. 질문?
1) 가
2) 나
3) 다
4) 라
2. 둘째?
1) a
2) b
3) c
4) d
`);
    const m = mergeAnswerKey(
      q.questions,
      `
1. 정답: 4번
  1) 옳음. 가 설명
  2) 옳음. 나 설명
  3) 옳음.
  4) 틀림. 라 설명
2. 정답: 1번
  해설: b 가 아니라 a
`,
    );
    expect(m.merged).toBe(2);
    expect(q.questions[0].correct).toBe(4);
    expect(q.questions[0].choices[3].explanation).toBe("틀림. 라 설명");
    expect(q.questions[0].choices[0].explanation).toBe("옳음. 가 설명");
    expect(q.questions[1].correct).toBe(1);
    expect(q.questions[1].explanation).toBe("b 가 아니라 a");
  });

  it("정답만 나열된 정답지 (1. ④)", () => {
    const q = parseQuestionText(`1. 질문?\n1) 가\n2) 나\n3) 다\n4) 라\n2. 둘째?\n1) a\n2) b\n3) c\n4) d`);
    const m = mergeAnswerKey(q.questions, `1. ④\n2. 1`);
    expect(m.merged).toBe(2);
    expect(q.questions.map((x) => x.correct)).toEqual([4, 1]);
  });
});

describe("JSON", () => {
  it("seed_questions.json 형식", () => {
    const r = parseJsonQuestions(
      JSON.stringify([
        {
          prompt: "질문?",
          choice_count: 4,
          correct_choice: 2,
          explanation: "전체 해설",
          lecture_no: 26,
          topic: "직권면직",
          difficulty: "very_hard",
          points: 2,
          trap_types: ["concept_swap"],
          source_quote: "근거 문장",
          choices: [
            { ord: 1, text: "가", explanation: null },
            { ord: 2, text: "나", explanation: "정답" },
            { ord: 3, text: "다" },
            { ord: 4, text: "라" },
          ],
        },
      ]),
    );
    expect(r.format).toBe("json");
    expect(r.questions[0].correct).toBe(2);
    expect(r.questions[0].unitHint).toBe(26);
    expect(r.questions[0].choices[1].explanation).toBe("정답");
    expect(r.questions[0].explanation).toBe("전체 해설");
    expect(r.questions[0].topic).toBe("직권면직");
    expect(r.questions[0].difficulty).toBe("very_hard");
    expect(r.questions[0].points).toBe(2);
    expect(r.questions[0].trapTypes).toEqual(["concept_swap"]);
    expect(r.questions[0].sourceQuote).toBe("근거 문장");
  });
});

describe("JSON: 주제·단원 경로·Claude 퀴즈 형식", () => {
  it("subject / unit_path 를 문항에 싣는다 (파일 수준 + 문항 수준)", () => {
    const r = parseJsonQuestions(
      JSON.stringify({
        subject: "토익",
        unit_path: ["콜로케이션", "파트1"],
        questions: [
          { prompt: "q1", correct_choice: 1, choices: ["a", "b", "c", "d"] },
          { prompt: "q2", correct_choice: 2, choices: ["a", "b", "c", "d"], unit_path: ["콜로케이션", "파트2"] },
        ],
      }),
    );
    expect(r.questions[0].subjectName).toBe("토익");
    expect(r.questions[0].unitPath).toEqual(["콜로케이션", "파트1"]);
    expect(r.questions[1].unitPath).toEqual(["콜로케이션", "파트2"]);
    expect(r.questions[0].choices[0].explanation).toBeNull(); // 선지 해설 없어도 됨
  });

  it("Claude 퀴즈 형식 {title, questions:[{options, correct_option_id}]}", () => {
    const r = parseJsonQuestions(
      JSON.stringify({
        title: "콜로케이션 파트1",
        questions: [
          {
            prompt: "make a ___",
            options: [
              { id: "a", text: "decision" },
              { id: "b", text: "homework" },
              { id: "c", text: "photo" },
              { id: "d", text: "exercise" },
            ],
            correct_option_id: "a",
            explanation: "make a decision",
            hint: null,
          },
        ],
      }),
    );
    expect(r.title).toBe("콜로케이션 파트1");
    expect(r.questions[0].choices.map((c) => c.text)).toEqual(["decision", "homework", "photo", "exercise"]);
    expect(r.questions[0].correct).toBe(1);
    expect(r.questions[0].explanation).toBe("make a decision");
  });
});

describe("단원 제목/파일명에서 번호·경로", () => {
  it("세트N / 파트N / Set N 을 번호로 읽는다", async () => {
    const { unitNoFromTitle, targetFromFilename } = await import("./targets");
    expect(unitNoFromTitle("세트07")).toBe(7);
    expect(unitNoFromTitle("Set 12")).toBe(12);
    expect(unitNoFromTitle("파트30")).toBe(30);
    expect(unitNoFromTitle("콜로케이션")).toBeNull();
    expect(targetFromFilename("toeic_vocab_set5.json")).toEqual({ subject: "토익", unitPath: ["어휘", "세트5"] });
    expect(targetFromFilename("toeic_collocation_part3.json")).toEqual({ subject: "토익", unitPath: ["콜로케이션", "파트3"] });
  });
});

describe("파일명 단원 추출", () => {
  it("N강 / part / day", () => {
    expect(unitNoFromFilename("과목_26강.txt")).toBe(26);
    expect(unitNoFromFilename("part5.txt")).toBe(5);
    expect(unitNoFromFilename("Day 12.md")).toBe(12);
    expect(unitNoFromFilename("notes.txt")).toBeNull();
  });
});

describe("한 파일에 문제지 + 뒤쪽 정답·해설 블록", () => {
  it("AI 생성 프롬프트 출력 형식을 그대로 읽는다", () => {
    const r = parseQuestionText(`
[3강] 학교 교육계획

1. 학교 교육계획 수립 절차로 옳은 것은?
1) 가
2) 나
3) 다
4) 라

2. 다음 중 틀린 것은?
1) a
2) b
3) c
4) d
5) e

==================
정답 및 해설
==================

1. 정답: 2번
  1) 틀림. 가 이유
  2) 옳음. 나 이유
  3) 틀림. 다 이유
  4) 틀림. 라 이유

2. 정답: 5번
  5) 틀림. e 이유
  힌트: 조문을 떠올려 보세요
`);
    expect(r.questions).toHaveLength(2);
    expect(r.questions.map((q) => q.correct)).toEqual([2, 5]);
    expect(r.questions.map((q) => q.unitHint)).toEqual([3, 3]);
    expect(r.questions[0].choices[1].explanation).toBe("옳음. 나 이유");
    expect(r.questions[0].choices[0].explanation).toBe("틀림. 가 이유");
    expect(r.questions[1].choices).toHaveLength(5);
    expect(r.questions[1].choices[4].explanation).toBe("틀림. e 이유");
    expect(r.questions[1].hint).toBe("조문을 떠올려 보세요");
  });
});
