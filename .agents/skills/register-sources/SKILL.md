---
name: register-sources
description: 자료 등록 절차 (mcquiz RAG). md/txt/html/pdf 자료를 과목에 올려 조각·임베딩까지 만든다. 비용 어림 → 등록 → 임베딩 상태 확인 → 검색 1회 검증. "자료 올려", "RAG 에 넣어", "임베딩" 요청에 사용.
---
1. 자료 폴더 `content/sources/<과목폴더>/`. 문서 한 편 = `.md` 하나, 첫 줄 `url: <출처>` (또는 머리말 url:). 책 PDF 는 `--kind book`, 웹 문서는 `--kind doc`.
2. 임베딩은 과목 단위로 켠다. 사용자가 임베딩을 원치 않는 과목(예: 제한 과목)은 돌리지 않는다 — 켤지 말지는 캡틴 결정.
3. 비용 어림: `npm run embed:chunks -- "<과목>" --dry` (100만 토큰당 $0.13).
4. 등록: `npm run upload:sources -- "<과목>" <폴더> --kind <종류>` (조각 + 임베딩까지). 서버 액션 경로는 40초 예산이므로 남은 조각은 `npm run embed:chunks -- "<과목>"`.
5. 검증: MCP `search_sources` 또는 로컬 질의 스크립트로 질문 2~3개 → 1위가 맞는지. 모드가 hybrid 인지.
6. 보고: 자료 수, 조각 수, 임베딩 수, 비용, 검증 질의 결과.
