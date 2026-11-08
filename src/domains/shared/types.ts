import type { Database } from "./database.types";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type Profile = Tables<"profiles">;
export type Subject = Tables<"subjects">;
export type Unit = Tables<"units">;
export type Collection = Tables<"collections">;
export type Source = Tables<"sources">;
export type QuestionSet = Tables<"question_sets">;
export type Question = Tables<"questions">;
export type Choice = Tables<"choices">;
export type Attempt = Tables<"attempts">;

export type QuestionWithChoices = Question & { choices: Choice[] };

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
