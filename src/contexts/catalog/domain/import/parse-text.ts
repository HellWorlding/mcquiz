import { emptyQuestion, type ParsedQuestion, type ParseResult } from "./types";

/**
 * 문제지 텍스트 파서.
 *  - 형식 2: `N. 질문` + `1) 선지`… + (별도 또는 같은 파일의) `N. 정답: k번` / `  k) 해설`
 *  - 형식 3: 복기 메모. 선지 번호가 `1 `, `1)`, `①`, `(1)` 어느 것이어도 됨. 정답·해설 없을 수 있음.
 *  - 줄바꿈이 깨져 한 줄에 여러 선지·문항이 붙은 경우도 번호 순서로 다시 나눈다.
 */

const CIRCLED: Record<string, number> = {
  "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
  "⑴": 1, "⑵": 2, "⑶": 3, "⑷": 4, "⑸": 5,
  "❶": 1, "❷": 2, "❸": 3, "❹": 4, "❺": 5,
};

export function normalizeText(raw: string): string {
  let s = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/\t/g, " ");
  // 전각 숫자 → 반각
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
  // 원문자 → (n)  (앞뒤에 공백을 넣어 마커로 인식되게)
  s = s.replace(/[①-⑩⑴-⑸❶-❺]/g, (c) => ` (${CIRCLED[c]}) `);
  s = s.replace(/．/g, ".");
  return s;
}

type MarkerKind = "dot" | "paren" | "wrapped" | "plain";
type Segment = { marker: { kind: MarkerKind; n: number } | null; text: string; lineStart: boolean };

const LINE_START_MARKER =
  /^\s*(?:\((\d{1,2})\)|(\d{1,3})\s*[.)]|(\d)(?=\s)|(?:문제|Q|q)\s*(\d{1,3})\s*[.):]?|(\d{1,3})\s*번[.)]?)\s*/;
const INLINE_MARKER = /(?<=\s)(?:\((\d{1,2})\)|(\d{1,3})[.)])(?=\s)/g;

function parseLeading(line: string): { marker: Segment["marker"]; rest: string } {
  const m = LINE_START_MARKER.exec(line);
  if (!m) return { marker: null, rest: line.trim() };
  const rest = line.slice(m[0].length);
  if (m[1] !== undefined) return { marker: { kind: "wrapped", n: +m[1] }, rest };
  if (m[2] !== undefined) {
    const kind: MarkerKind = m[0].trimEnd().endsWith(")") ? "paren" : "dot";
    return { marker: { kind, n: +m[2] }, rest };
  }
  if (m[3] !== undefined) return { marker: { kind: "plain", n: +m[3] }, rest };
  if (m[4] !== undefined) return { marker: { kind: "dot", n: +m[4] }, rest };
  if (m[5] !== undefined) return { marker: { kind: "dot", n: +m[5] }, rest };
  return { marker: null, rest: line.trim() };
}

/** 한 줄을 (선두 마커 + 본문) 조각과, 본문 안에 들어 있는 후보 마커 조각들로 나눈다 */
function segmentLine(line: string): Segment[] {
  const { marker, rest } = parseLeading(line);
  const segs: Segment[] = [];
  let last = 0;
  let first = true;
  const pushSeg = (mk: Segment["marker"], text: string) => {
    segs.push({ marker: mk, text: text.trim(), lineStart: first });
    first = false;
  };
  let cur: Segment["marker"] = marker;
  INLINE_MARKER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_MARKER.exec(rest))) {
    pushSeg(cur, rest.slice(last, m.index));
    cur = m[1] !== undefined ? { kind: "wrapped", n: +m[1] } : { kind: m[0].endsWith(")") ? "paren" : "dot", n: +m[2] };
    last = m.index + m[0].length;
  }
  pushSeg(cur, rest.slice(last));
  return segs;
}

const SEPARATOR = /^[\s=\-–—_*#~·.]{3,}$/;
const UNIT_HEADER = /^\s*[\[(【]?\s*(?:제\s*)?(\d{1,3})\s*(?:강|차시|단원|과)\s*[\])】]?\s*(.*)$/;
const INLINE_UNIT = /[\[(【]\s*(?:제\s*)?(\d{1,3})\s*(?:강|차시|단원)\s*[\])】]/;
const ANSWER = /^\s*(?:정답|답|answer)\s*[:：]?\s*[(\[]?(\d)[)\]]?\s*번?\s*(.*)$/i;
const COMPACT_ANSWER = /^\s*[-:：→]?\s*[(\[]?(\d)[)\]]?\s*번?\s*$/;
const EXPLAIN = /^\s*(?:해설|풀이|설명)\s*[:：]\s*(.*)$/;
const HINT = /^\s*(?:힌트|hint)\s*[:：]\s*(.*)$/i;
const TAG = /#([\p{L}\p{N}_]+)/gu;
const QUESTION_ENDING = /(\?|것은|것을|고르시오|고르면|옳은|옳지 않은|틀린|맞는|아닌|무엇인가|알맞은|적절한|해당하는|설명으로|경우는|내용은|것이다|순서대로|어느 것|가장)\s*[.?]?\s*$/;

function looksLikeQuestion(text: string): boolean {
  return QUESTION_ENDING.test(text.trim()) || text.trim().endsWith("?");
}

type State = {
  questions: ParsedQuestion[];
  cur: ParsedQuestion | null;
  mode: "questions" | "answers";
  /** answers 모드에서 해설이 붙는 문항 */
  target: ParsedQuestion | null;
  lastExplainOrd: number | null;
  unitHint: number | null;
  warnings: string[];
  plainStyle: boolean;
  pendingExplanation: string | null;
};

function finish(st: State) {
  const q = st.cur;
  if (!q) return;
  q.prompt = q.prompt.trim();
  for (const c of q.choices) c.text = c.text.trim();
  if (st.pendingExplanation) {
    q.explanation = q.explanation ? `${q.explanation}\n${st.pendingExplanation}` : st.pendingExplanation;
    st.pendingExplanation = null;
  }
  if (q.prompt || q.choices.length || q.correct !== null) st.questions.push(q);
  st.cur = null;
  st.plainStyle = false;
}

function startQuestion(st: State, no: number | null, text: string) {
  finish(st);
  const q = emptyQuestion(no);
  const um = INLINE_UNIT.exec(text);
  if (um) {
    q.unitHint = +um[1];
    text = text.replace(INLINE_UNIT, " ");
  } else if (st.unitHint !== null) {
    q.unitHint = st.unitHint;
  }
  q.prompt = text.trim();
  st.cur = q;
  st.mode = "questions";
  st.target = null;
  st.lastExplainOrd = null;
}

function findByNo(st: State, no: number): ParsedQuestion | null {
  for (let i = st.questions.length - 1; i >= 0; i--) if (st.questions[i].no === no) return st.questions[i];
  if (st.cur?.no === no) return st.cur;
  return null;
}

function applyAnswer(st: State, q: ParsedQuestion | null, ord: number, tail: string) {
  if (!q) return;
  if (ord < 1 || ord > 5) {
    q.warnings.push(`정답 번호 ${ord} 가 범위를 벗어남`);
    return;
  }
  q.correct = ord;
  st.mode = "answers";
  st.target = q;
  st.lastExplainOrd = null;
  const t = tail.trim();
  if (t) {
    const em = EXPLAIN.exec(t);
    st.pendingExplanation = (st.pendingExplanation ? st.pendingExplanation + "\n" : "") + (em ? em[1] : t);
  }
}

function appendText(st: State, text: string) {
  if (!text) return;
  if (st.mode === "answers" && st.target) {
    const hm = HINT.exec(text);
    if (hm) {
      st.target.hint = (st.target.hint ? st.target.hint + "\n" : "") + hm[1];
      st.lastExplainOrd = null;
      return;
    }
    const em = EXPLAIN.exec(text);
    if (em) {
      st.pendingExplanation = (st.pendingExplanation ? st.pendingExplanation + "\n" : "") + em[1];
      st.lastExplainOrd = null;
      return;
    }
    if (st.lastExplainOrd && st.target.choices[st.lastExplainOrd - 1]) {
      const c = st.target.choices[st.lastExplainOrd - 1];
      c.explanation = (c.explanation ?? "") + (c.explanation ? "\n" : "") + text;
      return;
    }
    st.pendingExplanation = (st.pendingExplanation ? st.pendingExplanation + "\n" : "") + text;
    return;
  }
  const q = st.cur;
  if (!q) return; // 머리말 등은 버린다
  const em = EXPLAIN.exec(text);
  if (em) {
    st.pendingExplanation = (st.pendingExplanation ? st.pendingExplanation + "\n" : "") + em[1];
    return;
  }
  const hm = HINT.exec(text);
  if (hm) {
    q.hint = (q.hint ? q.hint + "\n" : "") + hm[1];
    return;
  }
  if (q.choices.length) {
    const c = q.choices[q.choices.length - 1];
    c.text = c.text ? `${c.text} ${text}` : text;
  } else {
    q.prompt = q.prompt ? `${q.prompt}\n${text}` : text;
  }
}

function handleSegment(st: State, seg: Segment) {
  const { marker, text } = seg;

  // 정답 줄: "N. 정답: k번", "정답 ③", "답: 2"
  const am = ANSWER.exec(text);
  if (am) {
    let q: ParsedQuestion | null;
    if (marker && marker.kind === "dot") {
      q = findByNo(st, marker.n);
      if (!q) {
        // 문제지 없이 정답지만 들어온 경우: 번호만 있는 빈 문항을 만든다
        startQuestion(st, marker.n, "");
        q = st.cur;
      }
    } else {
      q = st.cur;
    }
    applyAnswer(st, q, +am[1], am[2]);
    return;
  }
  // 정답만 나열: "3. ④" / "3 - 4"
  if (marker && marker.kind === "dot" && COMPACT_ANSWER.test(text) && (st.mode === "answers" || findByNo(st, marker.n))) {
    const q = findByNo(st, marker.n) ?? (startQuestion(st, marker.n, ""), st.cur);
    applyAnswer(st, q, +COMPACT_ANSWER.exec(text)![1], "");
    return;
  }

  if (!marker) {
    if (seg.lineStart) {
      const um = UNIT_HEADER.exec(text);
      if (um && (!st.cur || st.cur.choices.length >= 4 || st.mode === "answers") && !looksLikeQuestion(text)) {
        st.unitHint = +um[1];
        return;
      }
    }
    appendText(st, text);
    return;
  }

  // ---- answers 모드: "k) 해설" 은 해당 선지의 해설 ----
  if (st.mode === "answers" && st.target) {
    const t = st.target;
    if (marker.kind !== "dot" && marker.n >= 1 && marker.n <= 5 && t.choices[marker.n - 1]) {
      const c = t.choices[marker.n - 1];
      c.explanation = c.explanation ? `${c.explanation}\n${text}` : text;
      st.lastExplainOrd = marker.n;
      return;
    }
    if (marker.kind === "dot") {
      // 새 문항 시작 (문제지가 이어지는 경우)
      startQuestion(st, marker.n, text);
      return;
    }
    appendText(st, text);
    return;
  }

  // ---- questions 모드 ----
  const q = st.cur;
  const nextChoice = (q?.choices.length ?? 0) + 1;
  const nextQ = q?.no != null ? q.no + 1 : null;

  const isChoiceMarker = marker.kind !== "dot";
  if (isChoiceMarker) {
    if (!q) {
      // 문항 없이 선지가 먼저 나오면 번호 없는 문항으로 시작
      if (marker.n === 1 && seg.lineStart) {
        startQuestion(st, null, "");
        st.cur!.choices.push({ text, explanation: null });
        return;
      }
      return;
    }
    const complete = q.choices.length >= 4;
    if (marker.n === nextChoice && marker.n <= 5 && (seg.lineStart || marker.kind !== "plain")) {
      if (marker.kind === "plain") st.plainStyle = true;
      q.choices.push({ text, explanation: null });
      return;
    }
    if (marker.n === 1 && complete && seg.lineStart && marker.kind !== "plain") {
      // 선지 1)이 다시 시작 → 번호 없는 새 문항 (문항 번호가 빠진 메모)
      startQuestion(st, nextQ, "");
      st.cur!.choices.push({ text, explanation: null });
      return;
    }
    // 그 외는 본문 이어쓰기 (마커 원문을 복원)
    appendText(st, `${marker.kind === "wrapped" ? `(${marker.n})` : marker.kind === "paren" ? `${marker.n})` : marker.n} ${text}`.trim());
    return;
  }

  // "N." 마커
  if (!q) {
    startQuestion(st, marker.n, text);
    return;
  }
  const complete = q.choices.length >= 4;
  const ambiguousChoice =
    !complete && marker.n === nextChoice && marker.n <= 5 && !looksLikeQuestion(text) && seg.lineStart;
  if (ambiguousChoice && !(nextQ !== null && marker.n === nextQ && q.choices.length === 0)) {
    q.choices.push({ text, explanation: null });
    return;
  }
  if (seg.lineStart || (nextQ !== null && marker.n === nextQ && complete)) {
    if (!seg.lineStart || complete || q.choices.length === 0 || nextQ === null || marker.n === nextQ) {
      startQuestion(st, marker.n, text);
      return;
    }
  }
  appendText(st, `${marker.n}. ${text}`);
}

export function parseQuestionText(raw: string, opts: { mode?: "questions" | "answers" } = {}): ParseResult {
  const text = normalizeText(raw);
  const st: State = {
    questions: [],
    cur: null,
    mode: opts.mode ?? "questions",
    target: null,
    lastExplainOrd: null,
    unitHint: null,
    warnings: [],
    plainStyle: false,
    pendingExplanation: null,
  };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (SEPARATOR.test(line)) continue;
    for (const seg of segmentLine(line)) handleSegment(st, seg);
  }
  finish(st);

  for (const q of st.questions) postProcess(q);
  return { questions: st.questions, warnings: st.warnings, format: st.questions.length ? "text" : "none" };
}

function postProcess(q: ParsedQuestion) {
  // 태그 (#태그)
  const tags = new Set<string>();
  q.prompt = q.prompt
    .replace(TAG, (_, t: string) => {
      tags.add(t);
      return "";
    })
    .replace(/\s+\n/g, "\n")
    .trim();
  q.tags = [...tags];
  // 배점 "(3점)"
  const pm = /[\[(](\d+(?:\.\d+)?)\s*점[\])]/.exec(q.prompt);
  if (pm) {
    q.points = +pm[1];
    q.prompt = q.prompt.replace(pm[0], "").trim();
  }
  if (q.choices.length < 4) {
    q.warnings.push(`선지가 ${q.choices.length}개뿐입니다. 확인이 필요합니다.`);
    while (q.choices.length < 4) q.choices.push({ text: "(선지 없음)", explanation: null });
  }
  if (q.choices.length > 5) {
    q.warnings.push(`선지가 ${q.choices.length}개입니다. 5개까지만 저장됩니다.`);
    q.choices = q.choices.slice(0, 5);
  }
  if (q.correct !== null && q.correct > q.choices.length) {
    q.warnings.push(`정답 번호(${q.correct})가 선지 수를 벗어납니다.`);
    q.correct = null;
  }
  if (q.correct === null) q.warnings.push("정답이 없습니다. 미리보기에서 지정하세요.");
  if (!q.prompt) q.warnings.push("질문 본문이 비어 있습니다.");
}

/** 별도 정답·해설 텍스트를 문항 목록에 병합한다 (문항 번호 기준) */
export function mergeAnswerKey(questions: ParsedQuestion[], answerText: string): { merged: number; warnings: string[] } {
  const key = parseQuestionText(answerText, { mode: "answers" });
  const byNo = new Map<number, ParsedQuestion>();
  for (const q of questions) if (q.no !== null) byNo.set(q.no, q);
  let merged = 0;
  const warnings: string[] = [];
  // 정답지에서는 "k) 해설" 이 선지 없이 들어오므로 answers 모드에서 choices 에 쌓이지 않는다.
  // parseQuestionText(answers) 는 빈 문항 + correct 만 만들고 해설은 pendingExplanation→hint 로 간다.
  // 그래서 여기서는 원문을 직접 다시 훑어 선지별 해설을 뽑는다.
  const explanations = extractExplanations(answerText);
  for (const k of key.questions) {
    if (k.no === null) continue;
    const q = byNo.get(k.no);
    if (!q) {
      warnings.push(`정답지의 ${k.no}번에 해당하는 문항이 없습니다.`);
      continue;
    }
    if (k.correct !== null) {
      q.correct = k.correct;
      q.warnings = q.warnings.filter((w) => !w.startsWith("정답이 없습니다"));
      merged++;
    }
    const ex = explanations.get(k.no);
    if (ex) {
      for (const [ord, textE] of ex.perChoice) {
        const c = q.choices[ord - 1];
        if (c) c.explanation = c.explanation ? `${c.explanation}\n${textE}` : textE;
      }
      if (ex.general) q.explanation = q.explanation ? `${q.explanation}\n${ex.general}` : ex.general;
    }
  }
  return { merged, warnings };
}

/** 정답지 원문에서 문항별 "k) 해설" / "해설: …" 을 뽑는다 */
function extractExplanations(raw: string): Map<number, { perChoice: Map<number, string>; general: string | null }> {
  const out = new Map<number, { perChoice: Map<number, string>; general: string | null }>();
  let curNo: number | null = null;
  let lastOrd: number | null = null;
  const text = normalizeText(raw);
  for (const line of text.split("\n")) {
    if (!line.trim() || SEPARATOR.test(line)) continue;
    const { marker, rest } = parseLeading(line);
    if (marker && marker.kind === "dot" && (ANSWER.test(rest) || COMPACT_ANSWER.test(rest))) {
      curNo = marker.n;
      lastOrd = null;
      out.set(curNo, { perChoice: new Map(), general: null });
      const am = ANSWER.exec(rest);
      const tail = am?.[2]?.trim();
      if (tail) {
        const e = out.get(curNo)!;
        const em = EXPLAIN.exec(tail);
        e.general = em ? em[1] : tail;
      }
      continue;
    }
    if (curNo === null) continue;
    const e = out.get(curNo)!;
    if (marker && marker.kind !== "dot" && marker.n >= 1 && marker.n <= 5) {
      e.perChoice.set(marker.n, (e.perChoice.get(marker.n) ? e.perChoice.get(marker.n) + "\n" : "") + rest.trim());
      lastOrd = marker.n;
      continue;
    }
    if (marker && marker.kind === "dot") {
      // 다른 번호의 시작 (정답 줄이 아님) → 무시
      curNo = null;
      continue;
    }
    const em = EXPLAIN.exec(rest);
    const t = em ? em[1] : rest.trim();
    if (lastOrd !== null && !em) {
      e.perChoice.set(lastOrd, e.perChoice.get(lastOrd) + "\n" + t);
    } else {
      e.general = e.general ? `${e.general}\n${t}` : t;
    }
  }
  return out;
}

/** 파일명에서 단원 번호 추출: 과목_26강.txt → 26, part5.txt → 5 */
export function unitNoFromFilename(name: string): number | null {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const m = /(\d{1,3})\s*(?:강|차시|단원|과|회)/.exec(base) ?? /(?:part|파트|day|unit)\s*[-_ ]?(\d{1,3})/i.exec(base);
  if (m) return +m[1];
  const nums = base.match(/\d{1,3}/g);
  if (nums && nums.length === 1) return +nums[0];
  return null;
}
