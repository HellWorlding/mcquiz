// knowledge 서버 진입점: 인프라 조립(make*Deps/Api)·세션. 서버 컴포넌트·액션·로더·스크립트만 import 한다. 클라이언트 컴포넌트("use client")에서는 금지.
export type { CatalogApiLike } from "./infrastructure/catalog-adapter";
export { makeKnowledgeDeps, makeKnowledgeApi } from "./infrastructure/make-deps";
