/** 임베딩 관련 순수 규칙. 모델·차원은 마이그레이션(knowledge.chunks.embedding vector(3072))과 맞춰야 한다 */
export const EMBEDDING_DIMS = 3072;

/** 조각을 임베딩할 때 넣는 글: 자료 제목·제목 경로를 앞에 붙여 맥락을 준다 (저장되는 content 는 그대로) */
export function embeddingInput(sourceTitle: string, heading: string | null, content: string): string {
  const head = [sourceTitle, heading].filter(Boolean).join(" > ");
  return head ? `${head}\n\n${content}` : content;
}

/** pgvector 입력 문자열 */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/** 대략의 토큰 수 (한글 ≈ 1자 1토큰 남짓, 영어 ≈ 4자 1토큰) → 비용 어림용 */
export function estimateTokens(text: string): number {
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  return Math.round(hangul * 1.2 + (text.length - hangul) / 4);
}

export type EmbedProgress = { total: number; done: number; skipped: boolean; failed: string | null };

/** 등록 결과 메시지에 붙는 임베딩 요약 (옛 importSourceFile 의 문구 그대로) */
export function embedNote(p: EmbedProgress): string {
  if (p.skipped) return "";
  if (p.failed) return ` · 임베딩 실패: ${p.failed}`;
  return p.done < p.total ? ` · 임베딩 ${p.done}/${p.total} (나머지는 npm run embed:chunks)` : ` · 임베딩 ${p.done}개`;
}
