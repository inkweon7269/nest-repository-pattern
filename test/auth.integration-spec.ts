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

  // ── 헬퍼 ─────────────────────────────────

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

  // ============================================================
  // POST /auth/register
  // ============================================================
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
        .send({
          email: 'not-an-email',
          password: 'password123',
          name: '테스트',
        })
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

  // ============================================================
  // POST /auth/login
  // ============================================================
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
      expect(Object.keys(res.body).sort()).toEqual([
        'accessToken',
        'refreshToken',
      ]);
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

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'password123', hacked: true })
        .expect(400);
    });
  });

  // ============================================================
  // POST /auth/refresh
  // ============================================================
  describe('POST /auth/refresh', () => {
    it('should return new { accessToken, refreshToken } with 200', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
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

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'some-token', hacked: true })
        .expect(400);
    });
  });
});
