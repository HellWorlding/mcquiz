/** Supabase(PostgREST)는 한 번에 최대 1,000행만 돌려준다. range 로 끝까지 받아온다. */
export async function allRows<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data } = await make(from, from + page - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}
