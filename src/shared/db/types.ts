import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** 컨텍스트 스키마 이름 */
export type Schema = "access" | "catalog" | "learning" | "knowledge" | "community";

export type Db = SupabaseClient<Database>;

type Tables<S extends Schema> = Database[S]["Tables"];
export type Row<S extends Schema, T extends keyof Tables<S>> = Tables<S>[T] extends { Row: infer R } ? R : never;
export type Insert<S extends Schema, T extends keyof Tables<S>> = Tables<S>[T] extends { Insert: infer I } ? I : never;
export type Update<S extends Schema, T extends keyof Tables<S>> = Tables<S>[T] extends { Update: infer U } ? U : never;
export type Fn<S extends Schema, F extends keyof Database[S]["Functions"]> = Database[S]["Functions"][F];
