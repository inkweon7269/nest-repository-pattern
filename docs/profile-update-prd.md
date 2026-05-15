# Profile Update PRD

## 1. 목표

인증된 사용자가 자신의 표시 이름(`name`)을 수정할 수 있도록 `PATCH /v1/auth/profile` 엔드포인트를 추가한다.
이메일·비밀번호 변경은 제외하며, 기존 `GET /v1/auth/profile`의 동일 리소스(User)에 PATCH 동사를 추가하는 방식으로 최소 범위를 유지한다.

> **스코프 변경 이력**: 초기 계획은 `nickname`, `bio` 두 컬럼을 추가하여 수정하는 것이었으나, 사용자 결정으로 신규 컬럼 없이 기존 `name` 컬럼만 수정하는 단순 구조로 변경됨. AddNicknameBioToUsers 마이그레이션은 revert되었고, 해당 컬럼은 DB·엔티티에서 모두 제거됨.

---

## 2. 사용자 시나리오

- **액터**: JWT로 인증된 사용자

**시나리오 1 — 정상 수정**
- Given: 유효한 Bearer 토큰을 보유하고 있다.
- When: `PATCH /v1/auth/profile` `{ "name": "홍길동" }` 요청을 보낸다.
- Then: HTTP 204 No Content가 반환되고, 이후 `GET /v1/auth/profile` 응답의 `name` 필드가 새 값으로 갱신된다.

**시나리오 2 — 인증 없이 호출**
- Given: Bearer 토큰이 없거나 만료되었다.
- When: `PATCH /v1/auth/profile` 요청을 보낸다.
- Then: HTTP 401 Unauthorized가 반환된다.

**시나리오 3 — 잘못된 길이의 name**
- Given: 유효한 Bearer 토큰을 보유하고 있다.
- When: `name`을 빈 문자열 또는 31자 이상으로 PATCH 요청한다.
- Then: HTTP 400 Bad Request가 반환된다 (ValidationPipe).

---

## 3. 수용 기준 (Acceptance Criteria)

- [ ] `PATCH /v1/auth/profile`은 JWT 없이 호출 시 401을 반환한다.
- [ ] `name`이 1자 미만이거나 30자를 초과하면 400을 반환한다.
- [ ] 성공 시 HTTP 204 No Content를 반환한다.
- [ ] 성공 후 `GET /v1/auth/profile` 응답의 `name`이 새 값으로 갱신된다.
- [ ] 사용자가 동시에 soft-delete된 코너 케이스에서 affected=0이면 `NotFoundException` (404)을 반환한다.
- [ ] Redis 장애 등으로 캐시 무효화가 실패해도 요청 자체는 204로 정상 완료된다 (Fail-Open).
- [ ] 빌드(`pnpm build:all`) 통과, 단위 테스트(`pnpm test`) 통과, 통합 테스트(`pnpm test:e2e:service`) 통과.

---

## 4. 비기능 요구사항

- **보안**: `JwtAuthGuard` 적용 — 본인만 자신의 프로필 수정 가능. JWT에서 `userId`를 추출하여 수정 대상이 고정되므로 타인 수정 불가 구조.
- **검증 (class-validator)**:
  - `name`: `@IsString()`, `@Length(1, 30)`, **필수 값** (`@IsOptional()` 적용 안 함). 빈 body `{}` 또는 `name` 미포함 요청은 400을 반환한다.
- **트랜잭션**: 단일 write 1건이므로 `@Transactional()` 불필요.
- **23505 매핑**: `name`에 unique 제약이 없으므로 23505 catch 불필요. 결과적으로 Handler에는 try-catch 자체가 없다.
- **멱등성**: 별도 Idempotency 처리 불필요 (Idempotency-Key 헤더 적용 제외).
- **캐시 무효화**: `profile:${userId}` 캐시를 invalidate. `invalidateProfileCache`는 `try/catch`로 Fail-Open 처리 (CLAUDE.md Cache Layer 규칙).
- **API 하위 호환**:
  - `GET /v1/auth/profile`의 응답 DTO(`ProfileResponseDto`) 필드 구성은 기존과 동일 (`id`, `email`, `name`, `createdAt`, `updatedAt`). 추가/제거된 필드 없음.
  - 따라서 기존 클라이언트에 영향 없음.

---

## 5. 범위 외 (Out of scope)

- 이메일 변경
- 비밀번호 변경
- `nickname`, `bio` 등 신규 프로필 필드 추가 (스코프 변경으로 제외됨)
- 프로필 이미지 업로드
- 어드민(back-office) 측 프로필 수정 API

---

## 6. 영향받는 파일 목록 (구현 팀 참고)

| 레이어 | 파일 | 변경 성격 |
|---|---|---|
| 엔티티 | `libs/shared/src/entities/user.entity.ts` | 변경 없음 (`name` 컬럼은 기존 존재) |
| 마이그레이션 | — | 신규 마이그레이션 없음 |
| Repository 인터페이스 | `apps/service/src/auth/interface/user-write-repository.interface.ts` | `UpdateUserInput`에 `name?: string` 추가 |
| Repository 구현 | `apps/service/src/auth/user.repository.ts` | 변경 없음 (기존 `update` 메서드 재사용) |
| Command | `apps/service/src/auth/command/update-profile.command.ts` (신규) | `userId`, `name` |
| Command Handler | `apps/service/src/auth/command/update-profile.handler.ts` (신규) | `updateNameOrThrow` + `invalidateProfileCache`(Fail-Open) |
| Request DTO | `apps/service/src/auth/dto/request/update-profile.request.dto.ts` (신규) | `name: string` 단일 필드 |
| Response DTO | `apps/service/src/auth/dto/response/profile.response.dto.ts` | 변경 없음 |
| Controller | `apps/service/src/auth/auth.controller.ts` | `PATCH profile` 라우트 추가 |
| Module | `apps/service/src/auth/auth.module.ts` | `UpdateProfileHandler` 등록 |
| 단위 테스트 | `apps/service/src/auth/command/update-profile.handler.spec.ts` (신규) | — |
| 통합 테스트 | `test/service/auth.integration-spec.ts` | PATCH 시나리오 추가 |
