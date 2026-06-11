import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from '../setup/integration-helper';
import { AdminTestModule } from './admin-test.module';

describe('Admin (integration)', () => {
  let app: INestApplication<App>;
  let txHelper: TransactionHelper;

  beforeAll(async () => {
    app = await createIntegrationApp(AdminTestModule, {
      corsOriginEnvKey: 'BACK_OFFICE_CORS_ORIGINS',
    });
    txHelper = useTransactionRollback(app);
  });

  beforeEach(() => txHelper.start());
  afterEach(() => txHelper.rollback());

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── 헬퍼 ─────────────────────────────────

  const defaultAdmin = {
    email: 'admin@example.com',
    password: 'password123',
    name: '관리자',
  };

  function registerAdmin(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/v1/back-office/auth/register')
      .send({ ...defaultAdmin, ...body });
  }

  async function registerAndLogin(body: Record<string, unknown> = {}) {
    await registerAdmin(body).expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/v1/back-office/auth/login')
      .send({
        email: (body.email as string) ?? defaultAdmin.email,
        password: (body.password as string) ?? defaultAdmin.password,
      })
      .expect(200);
    return loginRes.body as { accessToken: string; refreshToken: string };
  }

  // ── User 토큰 발급 헬퍼 ─────────────────

  async function registerAndLoginUser() {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: 'user@example.com',
        password: 'password123',
        name: '일반유저',
        marketingConsent: true,
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  // ============================================================
  // POST /admin/auth/register
  // ============================================================
  describe('POST /admin/auth/register', () => {
    it('회원가입 성공 시 201과 { id }를 반환한다', async () => {
      const res = await registerAdmin().expect(201);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('관리자를 저장한다 (로그인으로 검증)', async () => {
      await registerAdmin().expect(201);

      await request(app.getHttpServer())
        .post('/v1/back-office/auth/login')
        .send({ email: defaultAdmin.email, password: defaultAdmin.password })
        .expect(200);
    });

    it('항상 MANAGER 역할로 등록한다', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .get('/v1/back-office/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body.role).toBe('MANAGER');
    });

    it('중복된 이메일이면 409를 반환한다', async () => {
      await registerAdmin().expect(201);

      const res = await registerAdmin().expect(409);

      expect(res.body.message).toContain(defaultAdmin.email);
    });

    it('email이 누락되면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/register')
        .send({ password: 'password123', name: '테스트' })
        .expect(400);
    });

    it('password가 8자 미만이면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/register')
        .send({ email: 'a@b.com', password: 'short', name: '테스트' })
        .expect(400);
    });

    it('name이 누락되면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/register')
        .send({ email: 'a@b.com', password: 'password123' })
        .expect(400);
    });

    it('알 수 없는 속성이 포함되면 400을 반환한다 (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/register')
        .send({ ...defaultAdmin, role: 'SUPER' })
        .expect(400);
    });
  });

  // ============================================================
  // POST /admin/auth/login
  // ============================================================
  describe('POST /admin/auth/login', () => {
    it('로그인 성공 시 200과 { accessToken, refreshToken }을 반환한다', async () => {
      await registerAdmin().expect(201);

      const res = await request(app.getHttpServer())
        .post('/v1/back-office/auth/login')
        .send({ email: defaultAdmin.email, password: defaultAdmin.password })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(Object.keys(res.body).sort()).toEqual([
        'accessToken',
        'refreshToken',
      ]);
    });

    it('존재하지 않는 이메일이면 401을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);
    });

    it('비밀번호가 틀리면 401을 반환한다', async () => {
      await registerAdmin().expect(201);

      return request(app.getHttpServer())
        .post('/v1/back-office/auth/login')
        .send({ email: defaultAdmin.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('email이 누락되면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/login')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('password가 누락되면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/login')
        .send({ email: 'a@b.com' })
        .expect(400);
    });
  });

  // ============================================================
  // POST /admin/auth/refresh
  // ============================================================
  describe('POST /admin/auth/refresh', () => {
    it('새로운 { accessToken, refreshToken }과 200을 반환한다', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .post('/v1/back-office/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('rotation 후 기존 refresh token을 무효화한다', async () => {
      const tokens = await registerAndLogin();

      await request(app.getHttpServer())
        .post('/v1/back-office/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/back-office/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('유효하지 않은 토큰이면 401을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });

    it('refreshToken이 누락되면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  // ============================================================
  // GET /admin/auth/profile
  // ============================================================
  describe('GET /admin/auth/profile', () => {
    it('200과 함께 { id, email, name, role, createdAt, updatedAt } 프로필을 반환한다', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .get('/v1/back-office/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(res.body.email).toBe(defaultAdmin.email);
      expect(res.body.name).toBe(defaultAdmin.name);
      expect(res.body.role).toBe('MANAGER');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
      expect(Object.keys(res.body).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'name',
        'role',
        'updatedAt',
      ]);
    });

    it('응답에 password와 hashedRefreshToken을 포함하지 않는다', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .get('/v1/back-office/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('hashedRefreshToken');
    });

    it('토큰 없이 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/back-office/auth/profile')
        .expect(401);
    });

    it('유효하지 않은 토큰으로 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/back-office/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  // ============================================================
  // POST /admin/auth/logout
  // ============================================================
  describe('POST /admin/auth/logout', () => {
    it('로그아웃 성공 시 204를 반환한다', async () => {
      const { accessToken } = await registerAndLogin();

      await request(app.getHttpServer())
        .post('/v1/back-office/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('로그아웃 후 refresh token을 무효화한다', async () => {
      const { accessToken, refreshToken } = await registerAndLogin();

      await request(app.getHttpServer())
        .post('/v1/back-office/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/back-office/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('Authorization 헤더가 없으면 401을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/logout')
        .expect(401);
    });

    it('유효하지 않은 토큰이 제공되면 401을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/back-office/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  // ============================================================
  // 토큰 격리: User ↔ Admin 토큰 교차 사용 불가
  // ============================================================
  describe('Token isolation', () => {
    it('Admin 엔드포인트에서 User 토큰 사용 시 401로 거부한다', async () => {
      const userTokens = await registerAndLoginUser();

      await request(app.getHttpServer())
        .get('/v1/back-office/auth/profile')
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(401);
    });

    it('User 엔드포인트에서 Admin 토큰 사용 시 401로 거부한다', async () => {
      const adminTokens = await registerAndLogin();

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(401);
    });
  });
});
