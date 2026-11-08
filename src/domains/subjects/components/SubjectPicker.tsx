"use client";
import { useRouter } from "next/navigation";
import type { Subject } from "@/domains/shared/types";

export function SubjectPicker({ subjects, current, basePath }: { subjects: Subject[]; current: string; basePath: string }) {
  const router = useRouter();
  return (
    <select className="input w-auto py-2 text-sm" value={current} onChange={(e) => router.push(`${basePath}?subject=${e.target.value}`)}>
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
