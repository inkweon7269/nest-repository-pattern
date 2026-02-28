# Auth 모듈 PRD & 구현 가이드

> 회원가입, 로그인, 토큰 갱신 3개 API를 기존 Repository Pattern + CQRS 패턴에 맞춰 구현한다.

---

## 1. 개요

### 1.1 배경

현재 프로젝트는 Posts 도메인만 존재한다. 사용자 인증 기능을 추가하여 회원가입/로그인/토큰 갱신을 지원해야 한다.

### 1.2 목표

- JWT 기반 인증 (access token + refresh token 이중 토큰)
- 기존 아키텍처 패턴(CQRS + Repository ISP + BaseRepository)을 100% 준수
- 비밀번호는 bcrypt로 해시하여 저장
- Refresh token rotation 방식으로 보안 강화

### 1.3 API 명세

| Method | Path | 설명 | 상태코드 | 응답 |
|--------|------|------|----------|------|
| POST | `/auth/register` | 회원가입 | 201 Created | `{ id }` |
| POST | `/auth/login` | 로그인 | 200 OK | `{ accessToken, refreshToken }` |
| POST | `/auth/refresh` | 토큰 갱신 | 200 OK | `{ accessToken, refreshToken }` |

### 1.4 요청/응답 상세

**POST /auth/register**

```json
// Request
{ "email": "user@example.com", "password": "password123", "name": "홍길동" }

// Response 201
{ "id": 1 }

// Error 409 — 중복 이메일
{ "statusCode": 409, "message": "User with email 'user@example.com' already exists" }
```

**POST /auth/login**

```json
// Request
{ "email": "user@example.com", "password": "password123" }

// Response 200
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }

// Error 401 — 잘못된 자격증명
{ "statusCode": 401, "message": "Invalid email or password" }
```

**POST /auth/refresh**

```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{ "accessToken": "eyJ...(new)", "refreshToken": "eyJ...(new)" }

// Error 401 — 유효하지 않은 토큰
{ "statusCode": 401, "message": "Invalid or expired refresh token" }
```

---

## 2. 기술 결정

### 2.1 인증 방식

- **Access Token**: 짧은 수명 (기본 15분), API 요청 인증에 사용
- **Refresh Token**: 긴 수명 (기본 7일), access token 재발급에 사용
- **Refresh Token Rotation**: refresh 시 새 토큰 쌍 발급 + 이전 refresh token 무효화

### 2.2 보안

- 비밀번호: `bcrypt` (salt rounds: 10)
- Refresh token: DB에 bcrypt hash로 저장 (원본 노출 방지)
- 에러 메시지: "Invalid email or password" (이메일 존재 여부 노출 방지)
- Access token payload: `{ sub: userId, email }`
- Refresh token payload: `{ sub: userId, email, type: 'refresh' }` — type 필드로 access/refresh 구분

### 2.3 CQRS 분류

3개 API 모두 **Command**로 분류:
- Register: 사용자 생성 (상태 변경)
- Login: refresh token hash를 DB에 저장 (상태 변경)
- Refresh: 새 refresh token hash로 교체 (상태 변경)

### 2.4 패키지 의존성

```bash
# 런타임
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt

# 개발용
pnpm add -D @types/passport-jwt @types/bcrypt
```

---

## 3. 파일 구조

### 3.1 신규 생성 파일

```
src/auth/
├── entities/
│   └── user.entity.ts                          # User TypeORM 엔티티
├── interface/
│   ├── user-read-repository.interface.ts        # IUserReadRepository
│   └── user-write-repository.interface.ts       # IUserWriteRepository + CreateUserInput, UpdateUserInput
├── user.repository.ts                           # UserRepository (BaseRepository 상속)
├── user-repository.provider.ts                  # DI provider 배열
├── auth.types.ts                                # AuthTokens 도메인 타입
├── command/
│   ├── register.command.ts                      # RegisterCommand 값 객체
│   ├── register.handler.ts                      # RegisterHandler
│   ├── register.handler.spec.ts                 # 단위 테스트
│   ├── login.command.ts                         # LoginCommand 값 객체
│   ├── login.handler.ts                         # LoginHandler
│   ├── login.handler.spec.ts                    # 단위 테스트
│   ├── refresh-token.command.ts                 # RefreshTokenCommand 값 객체
│   ├── refresh-token.handler.ts                 # RefreshTokenHandler
│   └── refresh-token.handler.spec.ts            # 단위 테스트
├── dto/
│   ├── request/
│   │   ├── register.request.dto.ts              # 회원가입 요청 DTO
│   │   ├── login.request.dto.ts                 # 로그인 요청 DTO
│   │   └── refresh-token.request.dto.ts         # 토큰 갱신 요청 DTO
│   └── response/
│       ├── register.response.dto.ts             # 회원가입 응답 DTO
│       ├── register.response.dto.spec.ts        # 단위 테스트
│       ├── auth-tokens.response.dto.ts          # 토큰 응답 DTO
│       └── auth-tokens.response.dto.spec.ts     # 단위 테스트
├── strategy/
│   └── jwt.strategy.ts                          # Passport JWT 전략
├── guard/
│   └── jwt-auth.guard.ts                        # JWT 인증 가드
├── auth.controller.ts                           # Auth 컨트롤러
└── auth.module.ts                               # Auth 모듈

src/migrations/
└── {timestamp}-CreateUserTable.ts               # users 테이블 마이그레이션

test/
└── auth.integration-spec.ts                     # 통합 테스트
```

### 3.2 수정 파일

| 파일 | 변경 |
|------|------|
| `src/app.module.ts` | imports에 `AuthModule` 추가 |
| `src/main.ts` | Swagger에 `.addBearerAuth()` 추가 |
| `.env.example` | JWT 환경변수 3개 추가 |
| `.env.local` | JWT 환경변수 3개 추가 |

---

## 4. 데이터베이스 설계

### 4.1 users 테이블

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | int | PK, auto-increment | |
| email | varchar(255) | UNIQUE, NOT NULL | 로그인 식별자 |
| password | varchar(255) | NOT NULL | bcrypt hash |
| name | varchar(100) | NOT NULL | 사용자 이름 |
| hashedRefreshToken | varchar(255) | NULLABLE | refresh token의 bcrypt hash |
| createdAt | timestamp | DEFAULT now() | |
| updatedAt | timestamp | DEFAULT now() | |

### 4.2 환경변수

`.env.example`에 추가:

```
JWT_SECRET=your-jwt-secret-key
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
```

---

## 5. 테스트 전략

### 5.1 단위 테스트

모든 Handler에 조건 분기/비즈니스 로직이 존재하므로 전부 단위 테스트 대상:

| 파일 | 테스트 케이스 |
|------|--------------|
| `register.handler.spec.ts` | 성공, 중복 이메일(ConflictException), race condition(23505) |
| `login.handler.spec.ts` | 성공, 이메일 미존재(401), 비밀번호 불일치(401) |
| `refresh-token.handler.spec.ts` | 성공, 토큰 만료/변조(401), type 불일치(401), 사용자 미존재(401), hash 불일치(401) |
| `register.response.dto.spec.ts` | of() 매핑 검증 |
| `auth-tokens.response.dto.spec.ts` | of() 매핑 검증 |

### 5.2 통합 테스트

`test/auth.integration-spec.ts` — 기존 `posts.integration-spec.ts`와 동일한 패턴:

- `createIntegrationApp()` + `useTransactionRollback()` 사용
- HTTP 레벨 전체 플로우 검증 (Controller → Handler → Repository → DB)
- ValidationPipe 동작 확인 (400 응답)

---

## 6. 구현 체크리스트

### Phase 1: 환경 준비

- [ ] 패키지 설치
  ```bash
  pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
  pnpm add -D @types/passport-jwt @types/bcrypt
  ```
- [ ] `.env.example`에 환경변수 추가
  ```
  JWT_SECRET=your-jwt-secret-key
  JWT_ACCESS_EXPIRATION=15m
  JWT_REFRESH_EXPIRATION=7d
  ```
- [ ] `.env.local`에 실제 값 추가
  ```
  JWT_SECRET=local-jwt-secret-key-change-in-production
  JWT_ACCESS_EXPIRATION=15m
  JWT_REFRESH_EXPIRATION=7d
  ```

---

### Phase 2: 데이터베이스

- [ ] 마이그레이션 파일 생성
  ```bash
  pnpm migration:create -- src/migrations/CreateUserTable
  ```
- [ ] 마이그레이션 구현 (up/down)
- [ ] User 엔티티 생성 (`src/auth/entities/user.entity.ts`)
- [ ] 로컬 DB에 마이그레이션 실행
  ```bash
  pnpm migration:local
  ```

---

### Phase 3: Repository 레이어

- [ ] `IUserReadRepository` 인터페이스 생성
- [ ] `IUserWriteRepository` 인터페이스 + 도메인 타입 생성
- [ ] `UserRepository` 구현 (BaseRepository 상속)
- [ ] `userRepositoryProviders` DI 설정

---

### Phase 4: 회원가입 (POST /auth/register)

- [ ] `RegisterCommand` 값 객체 생성
- [ ] `RegisterHandler` 구현
- [ ] `RegisterRequestDto` 생성 (class-validator)
- [ ] `RegisterResponseDto` 생성 (static of)
- [ ] `RegisterResponseDto.spec.ts` 단위 테스트
- [ ] `RegisterHandler.spec.ts` 단위 테스트

---

### Phase 5: 로그인 (POST /auth/login)

- [ ] `auth.types.ts` 도메인 타입 생성 (AuthTokens)
- [ ] `LoginCommand` 값 객체 생성
- [ ] `LoginHandler` 구현
- [ ] `LoginRequestDto` 생성
- [ ] `AuthTokensResponseDto` 생성 (static of)
- [ ] `AuthTokensResponseDto.spec.ts` 단위 테스트
- [ ] `LoginHandler.spec.ts` 단위 테스트

---

### Phase 6: 토큰 갱신 (POST /auth/refresh)

- [ ] `RefreshTokenCommand` 값 객체 생성
- [ ] `RefreshTokenHandler` 구현
- [ ] `RefreshTokenRequestDto` 생성
- [ ] `RefreshTokenHandler.spec.ts` 단위 테스트

---

### Phase 7: Controller & Module 조립

- [ ] `JwtStrategy` 생성
- [ ] `JwtAuthGuard` 생성
- [ ] `AuthController` 생성 (3개 엔드포인트)
- [ ] `AuthModule` 생성
- [ ] `AppModule`에 `AuthModule` import 추가
- [ ] `main.ts` Swagger에 `.addBearerAuth()` 추가

---

### Phase 8: 통합 테스트

- [ ] `test/auth.integration-spec.ts` 작성

---

### Phase 9: 검증

- [ ] `pnpm build:local` — 빌드 성공
- [ ] `pnpm test` — 단위 테스트 통과
- [ ] `pnpm test:e2e` — 통합 테스트 통과 (Docker 필수)

---

## 7. 구현 가이드 — Phase 2: 데이터베이스

### 7.1 마이그레이션 파일

기존 `CreatePostTable` 마이그레이션을 참조하여 동일한 패턴으로 작성한다.

> 참조: `src/migrations/1770456974651-CreatePostTable.ts`

```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUserTable{timestamp} implements MigrationInterface {
  name = 'CreateUserTable{timestamp}';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'password',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'hashedRefreshToken',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
```

### 7.2 User 엔티티

기존 `Post` 엔티티와 동일한 패턴. `@Entity('users')` 데코레이터로 테이블명 지정.

> 참조: `src/posts/entities/post.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 255 })
  password: string; // bcrypt hash

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hashedRefreshToken: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

---

## 8. 구현 가이드 — Phase 3: Repository 레이어

### 8.1 IUserReadRepository

도메인 타입이 필요 없다 (회원 목록 조회 API가 없으므로 `UserFilter` 불필요).

> 참조: `src/posts/interface/post-read-repository.interface.ts`

```typescript
import { User } from '@src/auth/entities/user.entity';

export abstract class IUserReadRepository {
  abstract findById(id: number): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
}
```

### 8.2 IUserWriteRepository + 도메인 타입

도메인 타입(`CreateUserInput`, `UpdateUserInput`)을 인터페이스 파일에 co-locate한다.

> 참조: `src/posts/interface/post-write-repository.interface.ts`

```typescript
import { User } from '@src/auth/entities/user.entity';

export interface CreateUserInput {
  email: string;
  password: string; // 해시된 비밀번호 (Handler에서 해시 후 전달)
  name: string;
}

export interface UpdateUserInput {
  hashedRefreshToken?: string | null;
}

export abstract class IUserWriteRepository {
  abstract create(input: CreateUserInput): Promise<User>;
  abstract update(id: number, input: UpdateUserInput): Promise<number>;
}
```

핵심:
- `CreateUserInput.password`는 **이미 해시된** 비밀번호를 받는다 (Repository는 순수 데이터 접근)
- `UpdateUserInput`은 현재 `hashedRefreshToken`만 지원 (향후 확장 가능)
- `update`는 `Promise<number>` (affected count) 반환 — `PostRepository.update` 패턴과 동일

### 8.3 UserRepository 구현

> 참조: `src/posts/post.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/common/base.repository';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import {
  CreateUserInput,
  IUserWriteRepository,
  UpdateUserInput,
} from '@src/auth/interface/user-write-repository.interface';
import { User } from '@src/auth/entities/user.entity';

@Injectable()
export class UserRepository
  extends BaseRepository
  implements IUserReadRepository, IUserWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get userRepository() {
    return this.getRepository(User);
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = this.userRepository.create(input);
    return this.userRepository.save(user);
  }

  async update(id: number, input: UpdateUserInput): Promise<number> {
    const result = await this.userRepository.update(id, input);
    return result.affected ?? 0;
  }
}
```

핵심 패턴:
- `extends BaseRepository` → `DataSource` 주입, `getRepository<T>()` 사용
- `implements IUserReadRepository, IUserWriteRepository` → 두 인터페이스 모두 구현
- `private get userRepository()` → 엔티티 레포지토리 접근자
- 비즈니스 로직 없음 (순수 데이터 접근만)

### 8.4 DI Provider 설정

> 참조: `src/posts/post-repository.provider.ts`

```typescript
import { Provider } from '@nestjs/common';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';
import { UserRepository } from '@src/auth/user.repository';

export const userRepositoryProviders: Provider[] = [
  UserRepository,
  { provide: IUserReadRepository, useExisting: UserRepository },
  { provide: IUserWriteRepository, useExisting: UserRepository },
];
```

`useExisting` 패턴: 하나의 `UserRepository` 인스턴스를 두 추상 클래스 토큰에 매핑.

---

## 9. 구현 가이드 — Phase 4: 회원가입

### 9.1 RegisterCommand

> 참조: `src/posts/command/create-post.command.ts`

```typescript
export class RegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string, // 원본 비밀번호 (Handler에서 해시)
    public readonly name: string,
  ) {}
}
```

### 9.2 RegisterHandler

`CreatePostHandler`의 중복 체크 + race condition 처리 패턴을 그대로 적용한다.

> 참조: `src/posts/command/create-post.handler.ts`

```typescript
import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { RegisterCommand } from '@src/auth/command/register.command';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly userWriteRepository: IUserWriteRepository,
  ) {}

  async execute(command: RegisterCommand): Promise<number> {
    // 1. 중복 이메일 확인 (application-level)
    const existing = await this.userReadRepository.findByEmail(command.email);
    if (existing) {
      throw new ConflictException(
        `User with email '${command.email}' already exists`,
      );
    }

    // 2. 비밀번호 해시
    const hashedPassword = await bcrypt.hash(command.password, 10);

    // 3. 사용자 생성 (DB unique constraint race condition 처리)
    try {
      const user = await this.userWriteRepository.create({
        email: command.email,
        password: hashedPassword,
        name: command.name,
      });
      return user.id;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException(
          `User with email '${command.email}' already exists`,
        );
      }
      throw error;
    }
  }
}
```

핵심:
- `CreatePostHandler`와 동일 구조: 애플리케이션 레벨 중복 체크 → try/catch로 DB 레벨 race condition 처리
- 비밀번호 해시는 Handler에서 수행 (Repository는 해시된 값만 받음)
- 반환값: `number` (생성된 user id) — `CreatePostHandler`와 동일

### 9.3 RegisterRequestDto

> 참조: `src/posts/dto/request/create-post.request.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterRequestDto {
  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: '비밀번호 (최소 8자)', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: '이름', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
```

### 9.4 RegisterResponseDto

> 참조: `src/posts/dto/response/create-post.response.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({ description: '생성된 사용자 ID', example: 1 })
  id: number;

  static of(id: number): RegisterResponseDto {
    const dto = new RegisterResponseDto();
    dto.id = id;
    return dto;
  }
}
```

`CreatePostResponseDto.of(id)`와 완전히 동일한 패턴.

### 9.5 RegisterHandler 단위 테스트

> 참조: `src/posts/command/create-post.handler.spec.ts` (있다면)

```typescript
describe('RegisterHandler', () => {
  // Setup: Test.createTestingModule로 Handler 생성
  // Mock: IUserReadRepository, IUserWriteRepository
  // bcrypt는 jest.mock('bcrypt')로 모킹

  // 테스트 케이스:
  // 1. 중복되지 않는 이메일이면 사용자를 생성하고 id를 반환한다
  //    - findByEmail → null
  //    - bcrypt.hash 호출 확인
  //    - create 호출 확인 (해시된 비밀번호로)
  //    - 반환값 === user.id

  // 2. 동일한 이메일이 이미 존재하면 ConflictException을 발생시킨다
  //    - findByEmail → 기존 사용자 반환
  //    - create 호출되지 않음 확인

  // 3. DB unique constraint 위반 시(23505) ConflictException을 발생시킨다
  //    - findByEmail → null (통과)
  //    - create → QueryFailedError(code: 23505) throw
  //    - ConflictException 발생 확인
});
```

---

## 10. 구현 가이드 — Phase 5: 로그인

### 10.1 AuthTokens 도메인 타입

Handler가 반환하는 도메인 타입. Controller에서 `AuthTokensResponseDto.of()`로 변환.

```typescript
// src/auth/auth.types.ts
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
```

### 10.2 LoginCommand

```typescript
export class LoginCommand {
  constructor(
    public readonly email: string,
    public readonly password: string, // 원본 비밀번호
  ) {}
}
```

### 10.3 LoginHandler

```typescript
import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoginCommand } from '@src/auth/command/login.command';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';
import { AuthTokens } from '@src/auth/auth.types';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly userWriteRepository: IUserWriteRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: LoginCommand): Promise<AuthTokens> {
    // 1. 이메일로 사용자 조회
    const user = await this.userReadRepository.findByEmail(command.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(
      command.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. 토큰 생성
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>(
        'JWT_ACCESS_EXPIRATION',
        '15m',
      ),
    });

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRATION',
          '7d',
        ),
      },
    );

    // 4. Refresh token hash를 DB에 저장
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userWriteRepository.update(user.id, { hashedRefreshToken });

    return { accessToken, refreshToken };
  }
}
```

핵심:
- 의존성 4개: `IUserReadRepository`, `IUserWriteRepository`, `JwtService`, `ConfigService`
- 에러 메시지 통일: "Invalid email or password" (이메일/비밀번호 구분 없이)
- Refresh token의 **hash**를 DB에 저장 (원본 노출 방지)
- `configService.get()`의 두 번째 인자: 환경변수 미설정 시 기본값

### 10.4 LoginRequestDto

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: '비밀번호', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
```

### 10.5 AuthTokensResponseDto

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { AuthTokens } from '@src/auth/auth.types';

export class AuthTokensResponseDto {
  @ApiProperty({ description: '액세스 토큰' })
  accessToken: string;

  @ApiProperty({ description: '리프레시 토큰' })
  refreshToken: string;

  static of(tokens: AuthTokens): AuthTokensResponseDto {
    const dto = new AuthTokensResponseDto();
    dto.accessToken = tokens.accessToken;
    dto.refreshToken = tokens.refreshToken;
    return dto;
  }
}
```

### 10.6 LoginHandler 단위 테스트

```typescript
describe('LoginHandler', () => {
  // Setup: Test.createTestingModule
  // Mock: IUserReadRepository, IUserWriteRepository, JwtService, ConfigService
  // bcrypt는 jest.mock('bcrypt')로 모킹

  // 테스트 케이스:
  // 1. 유효한 이메일과 비밀번호로 토큰 쌍을 반환한다
  //    - findByEmail → 사용자 반환
  //    - bcrypt.compare → true
  //    - jwtService.sign 2회 호출 확인 (access, refresh)
  //    - userWriteRepository.update 호출 확인 (refresh hash 저장)
  //    - 반환값: { accessToken, refreshToken }

  // 2. 존재하지 않는 이메일이면 UnauthorizedException을 발생시킨다
  //    - findByEmail → null
  //    - bcrypt.compare 호출되지 않음

  // 3. 비밀번호가 틀리면 UnauthorizedException을 발생시킨다
  //    - findByEmail → 사용자 반환
  //    - bcrypt.compare → false
  //    - jwtService.sign 호출되지 않음
});
```

---

## 11. 구현 가이드 — Phase 6: 토큰 갱신

### 11.1 RefreshTokenCommand

```typescript
export class RefreshTokenCommand {
  constructor(
    public readonly refreshToken: string,
  ) {}
}
```

### 11.2 RefreshTokenHandler

```typescript
import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RefreshTokenCommand } from '@src/auth/command/refresh-token.command';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';
import { AuthTokens } from '@src/auth/auth.types';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler
  implements ICommandHandler<RefreshTokenCommand>
{
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly userWriteRepository: IUserWriteRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthTokens> {
    // 1. JWT 서명/만료 검증
    let payload: { sub: number; email: string; type?: string };
    try {
      payload = this.jwtService.verify(command.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. type === 'refresh' 검증 (access token 거부)
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 3. 사용자 존재 + hashedRefreshToken 존재 확인
    const user = await this.userReadRepository.findById(payload.sub);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 4. 제출된 토큰과 저장된 hash 비교 (rotation 검증)
    const isRefreshTokenValid = await bcrypt.compare(
      command.refreshToken,
      user.hashedRefreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 5. 새 토큰 쌍 발급
    const newPayload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(newPayload, {
      expiresIn: this.configService.get<string>(
        'JWT_ACCESS_EXPIRATION',
        '15m',
      ),
    });

    const refreshToken = this.jwtService.sign(
      { ...newPayload, type: 'refresh' },
      {
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRATION',
          '7d',
        ),
      },
    );

    // 6. 새 refresh token hash 저장 (rotation)
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userWriteRepository.update(user.id, { hashedRefreshToken });

    return { accessToken, refreshToken };
  }
}
```

핵심 검증 순서:
1. JWT 서명/만료 → 실패 시 401
2. payload.type === 'refresh' → access token으로 refresh 시도 방지
3. 사용자 존재 + hashedRefreshToken 존재 → 로그아웃된 사용자 방지
4. bcrypt.compare → 이전에 rotation된 토큰 재사용 방지
5. 새 토큰 쌍 발급 + hash 교체 (rotation 완료)

### 11.3 RefreshTokenRequestDto

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenRequestDto {
  @ApiProperty({ description: '리프레시 토큰' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
```

### 11.4 RefreshTokenHandler 단위 테스트

```typescript
describe('RefreshTokenHandler', () => {
  // Setup: Test.createTestingModule
  // Mock: IUserReadRepository, IUserWriteRepository, JwtService, ConfigService
  // bcrypt는 jest.mock('bcrypt')로 모킹

  // 테스트 케이스:
  // 1. 유효한 refresh token으로 새 토큰 쌍을 반환한다
  //    - jwtService.verify → { sub, email, type: 'refresh' }
  //    - findById → 사용자 반환 (hashedRefreshToken 존재)
  //    - bcrypt.compare → true
  //    - 새 토큰 발급 + hash 저장 확인

  // 2. jwtService.verify 실패 시 UnauthorizedException
  //    - verify → throw Error
  //    - findById 호출되지 않음

  // 3. type이 'refresh'가 아니면 UnauthorizedException
  //    - verify → { sub, email } (type 없음)
  //    - findById 호출되지 않음

  // 4. 사용자가 존재하지 않으면 UnauthorizedException
  //    - verify → 정상
  //    - findById → null

  // 5. hashedRefreshToken이 null이면 UnauthorizedException
  //    - verify → 정상
  //    - findById → 사용자 반환 (hashedRefreshToken: null)

  // 6. bcrypt.compare가 false면 UnauthorizedException (토큰 재사용 탐지)
  //    - verify → 정상
  //    - findById → 사용자 반환
  //    - bcrypt.compare → false
});
```

---

## 12. 구현 가이드 — Phase 7: Controller & Module 조립

### 12.1 JwtStrategy

향후 인증이 필요한 엔드포인트에서 `@UseGuards(JwtAuthGuard)`로 보호할 때 사용.

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: number;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email };
  }
}
```

### 12.2 JwtAuthGuard

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### 12.3 AuthController

> 참조: `src/posts/posts.controller.ts`

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RegisterCommand } from '@src/auth/command/register.command';
import { LoginCommand } from '@src/auth/command/login.command';
import { RefreshTokenCommand } from '@src/auth/command/refresh-token.command';
import { RegisterRequestDto } from '@src/auth/dto/request/register.request.dto';
import { LoginRequestDto } from '@src/auth/dto/request/login.request.dto';
import { RefreshTokenRequestDto } from '@src/auth/dto/request/refresh-token.request.dto';
import { RegisterResponseDto } from '@src/auth/dto/response/register.response.dto';
import { AuthTokensResponseDto } from '@src/auth/dto/response/auth-tokens.response.dto';
import { AuthTokens } from '@src/auth/auth.types';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('register')
  @ApiOperation({ summary: '회원가입' })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiConflictResponse({ description: '중복된 이메일' })
  async register(
    @Body() dto: RegisterRequestDto,
  ): Promise<RegisterResponseDto> {
    const id = await this.commandBus.execute<RegisterCommand, number>(
      new RegisterCommand(dto.email, dto.password, dto.name),
    );
    return RegisterResponseDto.of(id);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  async login(
    @Body() dto: LoginRequestDto,
  ): Promise<AuthTokensResponseDto> {
    const tokens = await this.commandBus.execute<LoginCommand, AuthTokens>(
      new LoginCommand(dto.email, dto.password),
    );
    return AuthTokensResponseDto.of(tokens);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '토큰 갱신' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiUnauthorizedResponse({ description: '유효하지 않은 리프레시 토큰' })
  async refresh(
    @Body() dto: RefreshTokenRequestDto,
  ): Promise<AuthTokensResponseDto> {
    const tokens = await this.commandBus.execute<
      RefreshTokenCommand,
      AuthTokens
    >(new RefreshTokenCommand(dto.refreshToken));
    return AuthTokensResponseDto.of(tokens);
  }
}
```

핵심 패턴 (`PostsController`와 동일):
- `CommandBus`만 주입 (3개 모두 Command이므로 `QueryBus` 불필요)
- `POST /auth/register` → 201 (NestJS POST 기본값)
- `POST /auth/login`, `POST /auth/refresh` → `@HttpCode(HttpStatus.OK)` (200)
- Handler 반환값을 `ResponseDto.of()`로 변환하여 응답

### 12.4 AuthModule

> 참조: `src/posts/posts.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from '@src/auth/auth.controller';
import { RegisterHandler } from '@src/auth/command/register.handler';
import { LoginHandler } from '@src/auth/command/login.handler';
import { RefreshTokenHandler } from '@src/auth/command/refresh-token.handler';
import { userRepositoryProviders } from '@src/auth/user-repository.provider';
import { JwtStrategy } from '@src/auth/strategy/jwt.strategy';
import { JwtAuthGuard } from '@src/auth/guard/jwt-auth.guard';

const commandHandlers = [RegisterHandler, LoginHandler, RefreshTokenHandler];

@Module({
  imports: [
    CqrsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    ...commandHandlers,
    ...userRepositoryProviders,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
```

핵심:
- `JwtModule.registerAsync()` — `forRootAsync` 원칙 준수 (eager evaluation 금지)
- `JwtAuthGuard` export — 다른 모듈에서 인증 가드로 사용 가능
- `queryHandlers` 배열 없음 (3개 API 모두 Command)

### 12.5 AppModule 수정

```typescript
// src/app.module.ts — imports 배열에 AuthModule 추가
import { AuthModule } from '@src/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ ... }),
    TypeOrmModule.forRootAsync({ ... }),
    PostsModule,
    AuthModule,  // ← 추가
  ],
})
export class AppModule {}
```

### 12.6 main.ts Swagger 수정

```typescript
// src/main.ts — DocumentBuilder에 addBearerAuth() 추가
const config = new DocumentBuilder()
  .setTitle('Posts API')
  .setDescription('NestJS Repository Pattern CRUD API')
  .setVersion('1.0')
  .addBearerAuth()  // ← 추가
  .build();
```

---

## 13. 구현 가이드 — Phase 8: 통합 테스트

> 참조: `test/posts.integration-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from './setup/integration-helper';

describe('Auth (integration)', () => {
  let app: INestApplication<App>;
  let txHelper: TransactionHelper;

  beforeAll(async () => {
    app = await createIntegrationApp();
    txHelper = useTransactionRollback(app);
  });

  beforeEach(() => txHelper.start());
  afterEach(() => txHelper.rollback());

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── 헬퍼 함수 ──────────────────────────────

  const defaultUser = {
    email: 'test@example.com',
    password: 'password123',
    name: '테스트유저',
  };

  function registerUser(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...defaultUser, ...body });
  }

  async function registerAndLogin(body: Record<string, unknown> = {}) {
    await registerUser(body).expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: (body.email as string) ?? defaultUser.email,
        password: (body.password as string) ?? defaultUser.password,
      })
      .expect(200);
    return loginRes.body as { accessToken: string; refreshToken: string };
  }

  // ── POST /auth/register ────────────────────

  describe('POST /auth/register', () => {
    it('should register and return { id } with 201', async () => {
      const res = await registerUser().expect(201);
      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('should persist user (verified via login)', async () => {
      await registerUser().expect(201);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: defaultUser.email, password: defaultUser.password })
        .expect(200);
    });

    it('should return 409 for duplicate email', async () => {
      await registerUser().expect(201);
      const res = await registerUser().expect(409);
      expect(res.body.message).toContain(defaultUser.email);
    });

    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ password: 'password123', name: '테스트' })
        .expect(400);
    });

    it('should return 400 when email format is invalid', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'password123', name: '테스트' })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'a@b.com', name: '테스트' })
        .expect(400);
    });

    it('should return 400 when password is shorter than 8 characters', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'short', name: '테스트' })
        .expect(400);
    });

    it('should return 400 when name is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'password123' })
        .expect(400);
    });

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...defaultUser, hacked: true })
        .expect(400);
    });
  });

  // ── POST /auth/login ──────────────────────

  describe('POST /auth/login', () => {
    it('should login and return { accessToken, refreshToken } with 200', async () => {
      await registerUser().expect(201);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: defaultUser.email, password: defaultUser.password })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
    });

    it('should return 401 for non-existent email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);
    });

    it('should return 401 for wrong password', async () => {
      await registerUser().expect(201);
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: defaultUser.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'a@b.com' })
        .expect(400);
    });
  });

  // ── POST /auth/refresh ────────────────────

  describe('POST /auth/refresh', () => {
    it('should return new { accessToken, refreshToken } with 200', async () => {
      const tokens = await registerAndLogin();
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // 새 토큰은 이전과 달라야 한다
      expect(res.body.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('should invalidate old refresh token after rotation', async () => {
      const tokens = await registerAndLogin();

      // 첫 번째 refresh — 성공
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      // 이전 토큰으로 다시 시도 — 실패 (rotation됨)
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('should return 401 for invalid token', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });

    it('should return 400 when refreshToken is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400);
    });
  });
});
```

---

## 14. 검증 명령

```bash
pnpm migration:local    # 마이그레이션 실행
pnpm build:local        # 빌드 확인
pnpm test               # 단위 테스트 통과
pnpm test:e2e           # 통합 테스트 통과 (Docker 필수)
```
