# Slack 알림 PRD: Post 생성 시 Slack 알림 전송

> **[2026-06 마이그레이션 노트]** 이 문서는 최초 구현 당시 `@nestjs/event-emitter`를 선택한 기록이다. 이후 이벤트 시스템은 `@nestjs/cqrs`의 `EventBus`(`@EventsHandler`)로 마이그레이션되었고 `@nestjs/event-emitter` 의존성은 제거되었다. 당시 미선택 사유였던 "EventBus는 동기 실행이라 핸들러 실패가 전파됨"은 @nestjs/cqrs v11 기준 부정확하다 — EventBus는 RxJS 스트림으로 핸들러를 비동기 실행하고, 핸들러 예외는 내부 `catchError`가 `UnhandledExceptionBus`로 발행하므로 publisher에 전파되지 않는다. 현행 구조는 CLAUDE.md의 "Event-Driven (CQRS EventBus + Slack)" 섹션 참고.

## 0. 용어 해설

이 문서에서 사용하는 주요 용어를 정리한다.

### 0.1 이벤트 관련 개념

| 용어 | 설명 |
|------|------|
| **Event Emitter** | 이벤트를 발행(emit)하고 구독(listen)하는 패턴. Node.js의 `EventEmitter`를 기반으로 NestJS가 `@nestjs/event-emitter` 패키지로 제공한다. 이벤트 발행자와 구독자가 서로를 직접 참조하지 않아 느슨한 결합(loose coupling)을 만든다. |
| **@OnEvent** | `@nestjs/event-emitter`가 제공하는 데코레이터. 메서드 위에 붙이면 특정 이벤트가 발행될 때 자동으로 호출된다. `{ async: true }` 옵션을 주면 이벤트 핸들러가 비동기로 실행되어, 핸들러의 성공/실패가 이벤트 발행자에게 전파되지 않는다. |
| **EventEmitter2** | `@nestjs/event-emitter`가 내부적으로 사용하는 라이브러리. Node.js 기본 `EventEmitter`보다 와일드카드 매칭, 비동기 이벤트 등 확장 기능을 제공한다. NestJS DI를 통해 주입받아 `emit()` 메서드로 이벤트를 발행한다. |
| **Fire-and-Forget** | 이벤트를 발행한 후 결과를 기다리지 않는 패턴. `@OnEvent({ async: true })`를 사용하면 이벤트 핸들러가 백그라운드에서 실행되므로, 핸들러가 실패해도 발행자(Command Handler)에 영향이 없다. |
| **CQRS Event vs Event Emitter** | `@nestjs/cqrs`의 `EventBus`는 동기적으로 핸들러를 호출하여 도메인 이벤트 처리에 적합하다. `@nestjs/event-emitter`는 비동기 fire-and-forget을 지원하여 Slack 알림 같은 부수효과(side effect)에 적합하다. 이 프로젝트에서는 부수효과용으로 Event Emitter를 선택했다. |

### 0.2 Slack 관련 개념

| 용어 | 설명 |
|------|------|
| **Slack Web API** | Slack이 공식 제공하는 REST API. Bot Token 하나로 여러 채널에 메시지를 보낼 수 있다. `@slack/web-api` 패키지의 `WebClient` 클래스가 이를 래핑한다. |
| **Bot Token** | Slack App에 부여되는 인증 토큰(`xoxb-`로 시작). 이 토큰으로 `chat.postMessage` API를 호출하여 메시지를 전송한다. 채널에 Bot을 초대해야 메시지를 보낼 수 있다. |
| **Incoming Webhook** | Slack이 제공하는 간편 알림 방식. 고유 URL로 HTTP POST를 보내면 메시지가 전송된다. 단, 1 URL = 1 채널로 고정되어 다채널 전송에 부적합하다. 이 프로젝트에서는 Slack Web API를 선택했다. |
| **chat.postMessage** | Slack Web API의 메시지 전송 엔드포인트. `channel`(대상 채널)과 `text`(메시지 내용)를 파라미터로 받는다. |

---

## 1. 배경

Post가 생성되면 팀에 Slack 알림을 보내고 싶다. 단, Slack 장애가 Post 생성에 영향을 주어서는 안 된다.

### 1.1 핵심 요구사항

- Post 생성 시 지정된 Slack 채널에 알림 전송
- Slack 장애 시에도 Post는 정상적으로 생성되어야 함
- 환경(production vs 그 외)에 따라 다른 채널로 전송

### 1.2 비요구사항

- Post 수정/삭제 시에는 Slack 알림을 보내지 않음
- 알림 전송 실패 시 재시도하지 않음 (로그만 남김)
- 메시지 포맷 커스터마이징(Block Kit 등)은 범위 밖

---

## 2. 설계 결정

### 2.1 이벤트 시스템: `@nestjs/event-emitter`

| 대안 | 선택 여부 | 이유 |
|------|-----------|------|
| **@nestjs/event-emitter** | **선택** | `{ async: true }` 옵션으로 fire-and-forget 구현. 핸들러 실패가 Command Handler에 전파되지 않아 별도 try-catch 불필요 |
| @nestjs/cqrs EventBus | 미선택 | 동기 실행이므로 핸들러 실패가 전파됨. try-catch 이중 방어가 필요하며, 부수효과보다 도메인 이벤트에 적합 |
| Handler에서 직접 호출 | 미선택 | Command Handler가 SlackService에 직접 의존하여 CQRS 원칙(상태 변경만 담당) 위반 |
| 메시지 큐 (Bull 등) | 미선택 | Redis 등 별도 인프라 필요. 단일 Slack 알림 + 재시도 불필요 상황에서 과도 |

### 2.2 Slack 연동: Web API (Bot Token)

| 대안 | 선택 여부 | 이유 |
|------|-----------|------|
| **Slack Web API** | **선택** | Bot Token 1개로 다채널 전송 가능. 채널을 파라미터로 지정하여 유연 |
| Incoming Webhook | 미선택 | 1 URL = 1 채널 고정. 채널 변경 시 Slack에서 재발급 필요 |

### 2.3 채널 관리: 코드 상수 (`NODE_ENV` 분기)

채널명은 `src/slack/slack.channels.ts`에서 `NODE_ENV` 기반 분기로 관리한다. 환경 변수로 관리하는 것 대비 관리 리소스를 절약한다.

```typescript
const isProduction = process.env.NODE_ENV === 'production';

export const SLACK_CHANNELS = {
  POST_CREATED: isProduction ? '#prod-post-created' : '#dev-post-created',
} as const;
```

---

## 3. 아키텍처

### 3.1 전체 흐름

```text
CreatePostHandler
  → post 저장 (Repository)
  → eventEmitter.emit('post.created', PostCreatedEvent)
  → return post.id (즉시 응답)
        ↓ (비동기, fire-and-forget)
  PostCreatedHandler (@OnEvent, async: true)
  → SlackService.sendPostCreatedNotification()
  → WebClient.chat.postMessage({ channel, text })
```

### 3.2 실패 격리

| 계층 | 방어 메커니즘 | 설명 |
|------|--------------|------|
| **Event Emitter** | `{ async: true }` | 핸들러가 비동기로 실행되어 실패가 Command Handler에 전파되지 않음 |
| **SlackService** | try-catch + Logger.error | Slack API 호출 실패 시 에러 로그만 남기고 예외를 던지지 않음 |
| **SlackService** | client 존재 확인 | `SLACK_BOT_TOKEN`이 미설정이면 warn 로그 후 skip |

### 3.3 모듈 구조

```text
AppModule
├── EventEmitterModule.forRoot()     ← 글로벌 이벤트 시스템
├── PostsModule
│   ├── CreatePostHandler            ← EventEmitter2 주입, 이벤트 발행
│   ├── PostCreatedHandler           ← @OnEvent('post.created', async)
│   └── SlackModule (import)
│       └── SlackService             ← WebClient로 Slack API 호출
└── ...
```

---

## 4. 파일 구조

### 4.1 신규 파일

| 파일 | 역할 |
|------|------|
| `src/slack/slack.module.ts` | SlackService를 제공하고 export하는 NestJS 모듈 |
| `src/slack/slack.service.ts` | Slack Web API를 호출하는 서비스. Bot Token으로 `WebClient` 생성, `chat.postMessage` 호출 |
| `src/slack/slack.channels.ts` | 환경별 Slack 채널 상수 정의 (`NODE_ENV` 분기) |
| `src/posts/event/post-created.event.ts` | 이벤트 값 객체. `static event = 'post.created'`로 이벤트명 co-locate |
| `src/posts/event/post-created.handler.ts` | `@OnEvent('post.created', { async: true })`로 Slack 알림 전송 |

### 4.2 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/app.module.ts` | `EventEmitterModule.forRoot()` import 추가 |
| `src/posts/command/create-post.handler.ts` | `EventEmitter2` 주입, post 저장 후 이벤트 emit |
| `src/posts/posts.module.ts` | `SlackModule` import, `PostCreatedHandler` providers 등록 |
| `.env.example` | `SLACK_BOT_TOKEN` 추가 |

---

## 5. 환경 설정

| 항목 | 값 | 관리 방식 |
|------|-----|-----------|
| `SLACK_BOT_TOKEN` | `xoxb-...` | 환경 변수 (`.env.*` 파일, Git 제외) |
| 채널명 | `#prod-post-created` / `#dev-post-created` | 코드 상수 (`slack.channels.ts`) |

### 5.1 Slack App 설정 절차

1. [Slack API](https://api.slack.com/apps)에서 App 생성
2. **OAuth & Permissions** → Bot Token Scopes에 `chat:write` 추가
3. **Install to Workspace** → Bot User OAuth Token (`xoxb-...`) 복사
4. `.env.local` 등에 `SLACK_BOT_TOKEN=xoxb-...` 설정
5. 대상 채널에 Bot을 초대 (`/invite @bot-name`)

---

## 6. 향후 확장 가능성

현재 구조에서 아래 기능은 코드 변경 없이 또는 최소 변경으로 확장 가능하다.

| 확장 | 방법 |
|------|------|
| 다른 이벤트 추가 (수정/삭제 알림) | Event + EventHandler 파일 추가, Handler에서 emit, Module에 등록 |
| 알림 채널 추가 (이메일, 푸시 등) | 새 EventHandler를 같은 이벤트에 구독. 하나의 이벤트에 여러 핸들러 가능 |
| 메시지 포맷 변경 (Block Kit) | `SlackService`의 `send()` 메서드에서 `text` 대신 `blocks` 파라미터 사용 |
| 재시도 로직 | Bull/BullMQ 큐 도입 시 EventHandler에서 큐에 작업 추가 |
