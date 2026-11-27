import { cleanup } from "./seed";

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_SEED === "1") return;
  await cleanup();
}
