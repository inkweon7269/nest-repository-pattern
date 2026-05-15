# Commit Skill

## Workflow

1. Run `pnpm format`, `pnpm lint:check`, `pnpm build:local`, `pnpm test`, and `pnpm test:e2e` to verify no regressions (Docker 필수)
2. Check changed files with `git status` and stage only relevant files (avoid `git add .`)
3. Generate a conventional commit message in Korean based on the diff (see "한국어 커밋 메시지 작성 가이드" below)
4. Before pushing, verify the current branch is NOT a protected branch (main/master). If it is, warn the user and abort the push
5. Commit and push to the current branch
6. Do NOT re-analyze or re-plan changes — just commit

> **이 가이드는 PR 본문에도 동일하게 적용된다.** `create-pr` skill에서 PR 제목·본문을 생성할 때 아래 규칙(특히 §1·§4·§6)을 그대로 따른다.

---

## 한국어 커밋 메시지 작성 가이드

신입 백엔드 개발자도 메시지만 읽고 의도와 흐름을 따라갈 수 있도록 다음 6가지 규칙을 따른다.

### 1. 영어 직역체를 자연스러운 한국어로

영어 코드 리뷰 문화의 표현을 그대로 직역하면 한국어로 어색하다. 다음 변환 표를 따른다.

| 직역체 (지양) | 자연스러운 한국어 (권장) |
|---|---|
| 본 커밋, 본 파일, 본 메서드 | 이 커밋, 이 파일, 이 메서드 |
| 본 프로젝트, 본 코드베이스, 본 모듈 | 이 프로젝트, 이 코드베이스, 이 모듈 |
| ~을 잇는다 | ~을 연결한다 |
| 양쪽 앱 wiring | 양쪽 앱 연결 / 양쪽 AppModule 등록 |
| 방어 깊이 추가 | 추가 안전망 한 겹 더 추가 |
| ~을 발사한다 (알림) | ~을 전송한다 / ~을 발송한다 |
| (코드명)을 본 (메서드)에 추가 | (코드명)을 (메서드)에 추가 |
| `name` 인자를 박다 / 박지 않는다 | `name` 인자를 지정하다 / 지정하지 않는다 |
| migration에 박다 (제약을) | migration에 작성하다 / 선언하다 |
| 발견을 만들다 / 코멘트를 만들다 | 발견을 올리다 / 코멘트를 남기다 |
| 응답을 쳐낸다 | 응답을 반환한다 / 응답한다 |

### 2. 약어/외래어는 첫 등장 시 한 번만 풀이

본문에 처음 등장할 때 짧은 풀이를 한 번만 곁들이고, 같은 메시지의 이후 등장에서는 약어 그대로 사용한다.

| 용어 | 권장 풀이 형식 |
|---|---|
| late-binding | "late-binding(NestJS DI 준비 후 연결)" |
| boot-time | "boot-time(앱 부팅 전 시점)" |
| Fail-Open | "Fail-Open(장애 시에도 호출자에 예외를 던지지 않고 통과)" |
| `@Global` | "`@Global`(전역 모듈로 등록되어)" |
| unhandled rejection | "처리 안 된 Promise 예외(unhandled rejection)" |
| semconv | "OTEL semantic convention(속성 명명 규약)" |
| 폴백(fallback) | "기본값으로 되돌림(폴백)" — 첫 등장에서만 |
| dedup | "중복 제거(dedup)" — 첫 등장에서만 |

이미 CLAUDE.md나 코드 주석에서 정의·설명된 용어는 본문에서 풀이를 생략해도 된다.

### 3. 한 문장에 정보 밀도를 과하게 싣지 않는다

신입 기준으로 **한 문장에 신규 개념 5개 이상이 동시 등장**하면 파싱이 안 된다. 5개를 넘기면 줄을 끊는다.

**나쁜 예** (한 문장에 9개 개념):

> "OnModuleInit에서 registerSlowQueryHandler로 콜백을 등록해 boot-time SpanProcessor → NestJS DI를 잇는다. SQL 본문 SHA-1 앞 16자를 dedup 키로 60초 TTL Redis dedup을 적용해 동일 슬로우 SQL 알림 폭주를 방지(분산 환경에서도 모든 인스턴스가 같은 키 공유)."

**좋은 예** (개념별로 줄 분리 + 짧은 풀이):

> NestJS 부팅이 끝난 시점에 콜백을 등록해 boot-time SpanProcessor와 NestJS DI 사이를 연결한다. 같은 SQL이 짧은 시간에 여러 번 느려져도 슬랙에 도배되지 않도록, SQL 본문의 SHA-1 해시 앞 16자를 키로 한 60초 Redis 중복 제거(dedup)를 적용한다. 분산 환경에서도 모든 인스턴스가 같은 키를 공유해 1건만 전송된다.

### 4. 형식 일관성

- **시제·종결어미**: 본문은 모두 동일한 형식으로 통일. 한 커밋 안에서 "~한다" / "~함" / 명사형을 섞지 않는다. 권장: **"~한다"** (능동·현재시제, 가장 깔끔)
- **Co-Authored-By 라인**: 다음 한 줄 형식으로 고정한다.
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
  `Claude Code`처럼 다른 표기를 섞지 않는다.
- **타입 prefix**: Conventional Commit 그대로 — `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `build:`, `ci:` 등.

### 5. 메시지 구조 템플릿

```
<type>: <70자 이내 제목 — 무엇이 바뀌는가, 왜 바뀌는가 한 줄로>

<왜 이 변경이 필요한가 1-2문장>

- <파일/모듈 1>: <무엇이 바뀌고, 왜>
- <파일/모듈 2>: <무엇이 바뀌고, 왜>

<검증 결과 또는 후속 영향 한 줄>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

각 bullet은 가능하면 2-3문장 이내. 그보다 길어지면 규칙 #3(정보 밀도)을 위반했다는 신호다.

### 6. 어색한 한국어 자가 점검

메시지를 쓴 뒤 push 전에 다음 항목을 빠르게 훑는다. 하나라도 걸리면 그 문장만 다시 다듬는다.

| 점검 항목 | 어색한 예 | 자연스러운 예 |
|---|---|---|
| 불필요한 사동 표현(시키다) | strategy를 우회**시켜** / 모듈을 등록**시키고** | strategy를 우회**하여** / 모듈을 등록**하고** |
| "본 X" 한자어 직역 | **본** 코드베이스에서는 | **이** 코드베이스에서는 |
| 구어 비속어("박다"·"쳐내다"·"꽂다") | 인자를 **박지** 않는다 | 인자를 **지정하지** 않는다 |
| 영어 동사 직역("fire"·"hit") | 알림을 **발사**한다 / 라우트를 **때린다** | 알림을 **전송**한다 / 라우트를 **호출**한다 |
| 호응이 깨진 긴 문장 | 신규 개념 5개를 한 호흡에 나열 | 줄을 끊고 각 줄에 한두 개념만 |
| 종결어미 혼용 | "~한다" / "~함" / "~하기" 섞임 | 한 메시지 내내 "~한다" 통일 |

자체 점검을 통과한 메시지만 `git commit`으로 넘긴다.
