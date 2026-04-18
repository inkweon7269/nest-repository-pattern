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
      .post('/v1/admin/auth/register')
      .send({ ...defaultAdmin, ...body });
  }

  async function registerAndLogin(body: Record<string, unknown> = {}) {
    await registerAdmin(body).expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/v1/admin/auth/login')
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
    it('should register and return { id } with 201', async () => {
      const res = await registerAdmin().expect(201);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('should persist admin (verified via login)', async () => {
      await registerAdmin().expect(201);

      await request(app.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({ email: defaultAdmin.email, password: defaultAdmin.password })
        .expect(200);
    });

    it('should always register with MANAGER role', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .get('/v1/admin/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body.role).toBe('MANAGER');
    });

    it('should return 409 for duplicate email', async () => {
      await registerAdmin().expect(201);

      const res = await registerAdmin().expect(409);

      expect(res.body.message).toContain(defaultAdmin.email);
    });

    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/register')
        .send({ password: 'password123', name: '테스트' })
        .expect(400);
    });

    it('should return 400 when password is shorter than 8 characters', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/register')
        .send({ email: 'a@b.com', password: 'short', name: '테스트' })
        .expect(400);
    });

    it('should return 400 when name is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/register')
        .send({ email: 'a@b.com', password: 'password123' })
        .expect(400);
    });

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/register')
        .send({ ...defaultAdmin, role: 'SUPER' })
        .expect(400);
    });
  });

  // ============================================================
  // POST /admin/auth/login
  // ============================================================
  describe('POST /admin/auth/login', () => {
    it('should login and return { accessToken, refreshToken } with 200', async () => {
      await registerAdmin().expect(201);

      const res = await request(app.getHttpServer())
        .post('/v1/admin/auth/login')
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

    it('should return 401 for non-existent email', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);
    });

    it('should return 401 for wrong password', async () => {
      await registerAdmin().expect(201);

      return request(app.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({ email: defaultAdmin.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({ email: 'a@b.com' })
        .expect(400);
    });
  });

  // ============================================================
  // POST /admin/auth/refresh
  // ============================================================
  describe('POST /admin/auth/refresh', () => {
    it('should return new { accessToken, refreshToken } with 200', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('should invalidate old refresh token after rotation', async () => {
      const tokens = await registerAndLogin();

      await request(app.getHttpServer())
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('should return 401 for invalid token', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });

    it('should return 400 when refreshToken is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  // ============================================================
  // GET /admin/auth/profile
  // ============================================================
  describe('GET /admin/auth/profile', () => {
    it('should return profile with { id, email, name, role, createdAt, updatedAt } and 200', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .get('/v1/admin/auth/profile')
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

    it('should not include password or hashedRefreshToken in response', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .get('/v1/admin/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('hashedRefreshToken');
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/v1/admin/auth/profile')
        .expect(401);
    });

    it('should return 401 with invalid token', () => {
      return request(app.getHttpServer())
        .get('/v1/admin/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  // ============================================================
  // POST /admin/auth/logout
  // ============================================================
  describe('POST /admin/auth/logout', () => {
    it('should return 204 on successful logout', async () => {
      const { accessToken } = await registerAndLogin();

      await request(app.getHttpServer())
        .post('/v1/admin/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('should invalidate refresh token after logout', async () => {
      const { accessToken, refreshToken } = await registerAndLogin();

      await request(app.getHttpServer())
        .post('/v1/admin/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('should return 401 when no Authorization header is provided', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/logout')
        .expect(401);
    });

    it('should return 401 when an invalid token is provided', () => {
      return request(app.getHttpServer())
        .post('/v1/admin/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  // ============================================================
  // 토큰 격리: User ↔ Admin 토큰 교차 사용 불가
  // ============================================================
  describe('Token isolation', () => {
    it('should reject User token on Admin endpoints (401)', async () => {
      const userTokens = await registerAndLoginUser();

      await request(app.getHttpServer())
        .get('/v1/admin/auth/profile')
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(401);
    });

    it('should reject Admin token on User endpoints (401)', async () => {
      const adminTokens = await registerAndLogin();

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(401);
    });
  });
});
