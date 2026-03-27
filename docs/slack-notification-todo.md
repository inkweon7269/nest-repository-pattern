# Slack 알림 구현 체크리스트

> Post 생성 시 Slack 알림을 전송하는 기능의 단계별 체크리스트.
> 각 단계는 의존성 순서로 정렬되어 있으며, 순서대로 진행해야 한다.
>
> 용어가 낯설다면 [slack-notification-prd.md](./slack-notification-prd.md)의 **0. 용어 해설** 섹션을 먼저 읽어보자.

---

## 용어 빠른 참조

체크리스트에서 자주 등장하는 용어만 간추린 요약이다. 자세한 설명은 PRD 문서의 용어 해설을 참고한다.

| 용어 | 한줄 요약 |
|------|-----------|
| **EventEmitter2** | `@nestjs/event-emitter`의 이벤트 발행 클래스. `emit()`으로 이벤트를 발행한다 |
| **@OnEvent** | 이벤트를 구독하는 데코레이터. `{ async: true }`로 비동기 fire-and-forget 실행 |
| **Fire-and-Forget** | 이벤트 발행 후 결과를 기다리지 않는 패턴. 핸들러 실패가 발행자에 영향 없음 |
| **WebClient** | `@slack/web-api`가 제공하는 Slack API 클라이언트 |
| **Bot Token** | Slack App 인증 토큰 (`xoxb-`). `chat.postMessage` 호출에 필요 |

---

## Phase 1: 패키지 설치

- [x] `@nestjs/event-emitter` 설치
  ```bash
  pnpm add @nestjs/event-emitter
  ```
- [x] `@slack/web-api` 설치
  ```bash
  pnpm add @slack/web-api
  ```

---

## Phase 2: Slack 모듈 생성

> **이 단계에서 하는 일:** Slack Web API를 호출하는 서비스와 환경별 채널 상수를 정의한다. 이 모듈은 Slack과의 통신을 캡슐화하여 다른 모듈이 Slack의 구체적인 구현에 의존하지 않게 한다.

- [x] `src/slack/slack.channels.ts` 생성
  - `NODE_ENV === 'production'` 분기로 환경별 채널 상수 정의
  - `SLACK_CHANNELS.POST_CREATED` — production이면 `#prod-post-created`, 그 외 `#dev-post-created`
  - `as const` assertion으로 타입 안전성 확보

- [x] `src/slack/slack.service.ts` 생성
  - `ConfigService`에서 `SLACK_BOT_TOKEN` 주입
  - token이 있으면 `WebClient` 인스턴스 생성, 없으면 `undefined`
  - `sendPostCreatedNotification(postId, title, userId)` — public 메서드, 알림 내용 구성 후 `send()` 호출
  - `send(channel, text)` — private 메서드, 실제 Slack API 호출
    - client 미설정 시 → `Logger.warn()` 후 return (에러 아님)
    - API 호출 실패 시 → `Logger.error()` 후 예외를 던지지 않음 (1차 방어)

- [x] `src/slack/slack.module.ts` 생성
  - `providers`에 `SlackService` 등록
  - `exports`에 `SlackService` 추가 — 다른 모듈에서 import 가능

---

## Phase 3: 이벤트 생성

> **이 단계에서 하는 일:** Post 생성 완료를 나타내는 이벤트 값 객체를 정의한다. 이벤트명을 `static` 필드로 co-locate하여 발행자와 구독자가 동일한 상수를 참조하게 한다.

- [x] `src/posts/event/post-created.event.ts` 생성
  - `static readonly event = 'post.created'` — 이벤트명 상수
  - 생성자: `postId`, `title`, `userId` (모두 `readonly`)
  - `@nestjs/cqrs`의 `IEvent`에 의존하지 않음 — 순수 값 객체

---

## Phase 4: 이벤트 핸들러 생성

> **이 단계에서 하는 일:** `post.created` 이벤트를 구독하여 Slack 알림을 전송하는 핸들러를 만든다. `{ async: true }` 옵션으로 fire-and-forget 실행하여, 핸들러 실패가 이벤트 발행자에게 전파되지 않는다.

- [x] `src/posts/event/post-created.handler.ts` 생성
  - `@Injectable()` — NestJS DI에 등록
  - `@OnEvent(PostCreatedEvent.event, { async: true })` — 비동기 구독
  - `SlackService.sendPostCreatedNotification()` 호출
  - try-catch 불필요 — `async: true`와 SlackService 내부 방어로 이중 격리 완료

---

## Phase 5: 기존 파일 수정

### 5.1 AppModule 수정

- [x] `src/app.module.ts` 수정
  - `EventEmitterModule.forRoot()` import 추가 — 글로벌 이벤트 시스템 활성화
  - `ConfigModule` 다음에 위치

### 5.2 CreatePostHandler 수정

- [x] `src/posts/command/create-post.handler.ts` 수정
  - 생성자에 `EventEmitter2` 주입
  - post 저장 성공 후 `this.eventEmitter.emit(PostCreatedEvent.event, new PostCreatedEvent(...))` 호출
  - 이벤트 발행은 try-catch 블록 내부, `return post.id` 직전에 위치 (저장 실패 시 이벤트 미발행)

### 5.3 PostsModule 수정

- [x] `src/posts/posts.module.ts` 수정
  - `imports`에 `SlackModule` 추가
  - `eventHandlers` 배열에 `PostCreatedHandler` 추가
  - `providers`에 `...eventHandlers` spread

### 5.4 환경변수 템플릿 수정

- [x] `.env.example` 수정
  - `SLACK_BOT_TOKEN=xoxb-your-slack-bot-token` 추가

---

## Phase 6: 단위 테스트 수정

> **이 단계에서 하는 일:** `CreatePostHandler`에 `EventEmitter2`가 추가되었으므로 기존 단위 테스트에 mock을 추가한다.

- [x] `src/posts/command/create-post.handler.spec.ts` 수정
  - `mockEventEmitter = { emit: jest.fn() }` 생성
  - `{ provide: EventEmitter2, useValue: mockEventEmitter }` provider 추가

---

## Phase 7: 검증

### 7.1 포맷 및 린트

- [x] `pnpm format` 실행 — 포맷 자동 수정
- [x] `pnpm lint:check` 실행 — 린트 검사 통과 확인

### 7.2 빌드

- [x] `pnpm build:local` 실행 — 빌드 성공 확인

### 7.3 단위 테스트

- [x] `pnpm test` 실행 — 모든 단위 테스트 통과 확인
  - CreatePostHandler 테스트 (EventEmitter2 mock 포함)
  - UpdatePostHandler, DeletePostHandler 테스트 (이벤트 관련 코드 없음)
  - DTO 단위 테스트 (변경 없음)

### 7.4 통합 테스트

- [x] `pnpm test:e2e` 실행 — 통합 테스트 통과 확인 (Docker 필요)
  - `test/posts.integration-spec.ts`
  - `test/auth.integration-spec.ts`

### 7.5 수동 검증 (선택)

- [ ] `.env.local`에 `SLACK_BOT_TOKEN` 설정
- [ ] 대상 채널에 Bot 초대
- [ ] `pnpm start:local` — 로컬 서버 기동
- [ ] `POST /posts` 요청 → Slack 채널에 알림 도착 확인
- [ ] `SLACK_BOT_TOKEN` 미설정 상태에서 `POST /posts` → Post 정상 생성, warn 로그 확인

---

## 파일 변경 요약

### 신규 생성 (5개)

| 파일 | 유형 |
|------|------|
| `src/slack/slack.module.ts` | NestJS 모듈 |
| `src/slack/slack.service.ts` | Slack API 서비스 |
| `src/slack/slack.channels.ts` | 채널 상수 |
| `src/posts/event/post-created.event.ts` | 이벤트 값 객체 |
| `src/posts/event/post-created.handler.ts` | 이벤트 핸들러 |

### 수정 (5개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/app.module.ts` | `EventEmitterModule.forRoot()` import 추가 |
| `src/posts/command/create-post.handler.ts` | `EventEmitter2` 주입 + 이벤트 발행 |
| `src/posts/posts.module.ts` | `SlackModule` import + `PostCreatedHandler` 등록 |
| `src/posts/command/create-post.handler.spec.ts` | `EventEmitter2` mock 추가 |
| `.env.example` | `SLACK_BOT_TOKEN` 추가 |

### 변경 없음

| 파일 | 이유 |
|------|------|
| `src/posts/command/update-post.handler.ts` | 수정/삭제 이벤트 불필요 |
| `src/posts/command/delete-post.handler.ts` | 수정/삭제 이벤트 불필요 |
| `src/posts/**/*.spec.ts` (update/delete) | 이벤트 관련 코드 없음 |
| `test/**/*.integration-spec.ts` | Slack 토큰 미설정 시 warn 로그만 남기므로 테스트에 영향 없음 |
