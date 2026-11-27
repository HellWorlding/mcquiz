import { cleanup, createSeed } from "./seed";

export default async function globalSetup() {
  await cleanup();
  const s = await createSeed();
  process.env.E2E_SEED = JSON.stringify(s);
}
