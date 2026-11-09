/** 페이지 데이터가 오기 전에 먼저 보이는 틀. 탭을 누르자마자 반응이 있게 한다. */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <div className="h-8 w-40 rounded-lg bg-border" />
      <div className="flex gap-2">
        <div className="h-8 w-20 rounded-full bg-border" />
        <div className="h-8 w-20 rounded-full bg-border" />
      </div>
      <div className="card h-24" />
      <div className="card h-40" />
      <p className="text-center text-sm text-muted">불러오는 중…</p>
    </div>
  );
}
