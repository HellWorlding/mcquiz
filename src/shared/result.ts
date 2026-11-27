/** use case 결과. 예외를 던지지 않고 이 값으로 성공/실패를 돌려준다 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });

/** 옛 이름 (서버 액션 호환) */
export type ActionResult<T = void> = Result<T>;
