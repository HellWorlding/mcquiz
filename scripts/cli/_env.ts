/**
 * .env.local → .env 순서로 환경변수를 올린다. `@/shared/env` 는 import 시점에 process.env 를 읽으므로
 * cli.ts 의 **첫 import** 여야 한다 (명령 모듈은 이 뒤에 동적으로 import 한다).
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
