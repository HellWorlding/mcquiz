export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  adminEmail: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
  publicGuestAccess: (process.env.PUBLIC_GUEST_ACCESS ?? "false").toLowerCase() === "true",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-6-luna",
  /** 자료 조각 임베딩 모델 (RAG). 바꾸면 npm run embed:chunks -- "<주제>" --force 로 다시 만든다 */
  embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-large",
};

export function hasOpenAI() {
  return env.openaiApiKey.length > 0;
}
