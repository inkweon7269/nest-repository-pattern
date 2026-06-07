import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from '../setup/integration-helper';
import { ServiceAppModule } from '../../apps/service/src/app.module';

describe('Auth (integration)', () => {
  let app: INestApplication<App>;
  let txHelper: TransactionHelper;

  beforeAll(async () => {
    app = await createIntegrationApp(ServiceAppModule);
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
    marketingConsent: true,
  };

  function registerUser(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ ...defaultUser, ...body });
  }

  async function registerAndLogin(body: Record<string, unknown> = {}) {
    await registerUser(body).expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
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
    it('should register and return { id, marketingConsent } with 201', async () => {
      const res = await registerUser().expect(201);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body).sort()).toEqual(['id', 'marketingConsent']);
    });

    it('marketingConsent: true로 가입하면 응답에 marketingConsent: true가 포함된다', async () => {
      const res = await registerUser({ marketingConsent: true }).expect(201);

      expect(res.body.marketingConsent).toBe(true);
    });

    it('marketingConsent: false로 가입하면 응답에 marketingConsent: false가 포함된다', async () => {
      const res = await registerUser({
        email: 'noconsent@example.com',
        marketingConsent: false,
      }).expect(201);

      expect(res.body.marketingConsent).toBe(false);
    });

    it('marketingConsent가 누락되면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'a@b.com', password: 'password123', name: '테스트' })
        .expect(400);
    });

    it('should persist user (verified via login)', async () => {
      await registerUser().expect(201);

      await request(app.getHttpServer())
        .post('/v1/auth/login')
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
        .post('/v1/auth/register')
        .send({
          password: 'password123',
          name: '테스트',
          marketingConsent: true,
        })
        .expect(400);
    });

    it('should return 400 when email format is invalid', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'password123',
          name: '테스트',
          marketingConsent: true,
        })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'a@b.com', name: '테스트', marketingConsent: true })
        .expect(400);
    });

    it('should return 400 when password is shorter than 8 characters', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'a@b.com',
          password: 'short',
          name: '테스트',
          marketingConsent: true,
        })
        .expect(400);
    });

    it('should return 400 when name is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'a@b.com',
          password: 'password123',
          marketingConsent: true,
        })
        .expect(400);
    });

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/register')
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
        .post('/v1/auth/login')
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
        .post('/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);
    });

    it('should return 401 for wrong password', async () => {
      await registerUser().expect(201);

      return request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: defaultUser.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'a@b.com' })
        .expect(400);
    });

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/login')
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
        .post('/v1/auth/refresh')
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
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      // 이전 토큰으로 다시 시도 — 실패 (rotation됨)
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('should return 401 for invalid token', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });

    it('should return 400 when refreshToken is missing', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({})
        .expect(400);
    });

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'some-token', hacked: true })
        .expect(400);
    });
  });

  // ============================================================
  // GET /auth/profile
  // ============================================================
  describe('GET /auth/profile', () => {
    it('should return profile with { id, email, name, marketingConsent, createdAt, updatedAt } and 200', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(res.body.email).toBe(defaultUser.email);
      expect(res.body.name).toBe(defaultUser.name);
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
      expect(Object.keys(res.body).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'marketingConsent',
        'name',
        'updatedAt',
      ]);
    });

    it('가입 시 동의한 marketingConsent가 프로필 조회에 반영된다', async () => {
      const tokens = await registerAndLogin({
        email: 'consent-profile@example.com',
        marketingConsent: true,
      });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body.marketingConsent).toBe(true);
    });

    it('가입 시 미동의한 marketingConsent가 프로필 조회에 반영된다', async () => {
      const tokens = await registerAndLogin({
        email: 'noconsent-profile@example.com',
        marketingConsent: false,
      });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body.marketingConsent).toBe(false);
    });

    it('should not include password or hashedRefreshToken in response', async () => {
      const tokens = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('hashedRefreshToken');
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer()).get('/v1/auth/profile').expect(401);
    });

    it('should return 401 with invalid token', () => {
      return request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  // ============================================================
  // PATCH /auth/profile
  // ============================================================
  describe('PATCH /auth/profile', () => {
    it('토큰 없이 PATCH 시 401을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/auth/profile')
        .send({ name: '새이름' })
        .expect(401);
    });

    it('name을 수정하면 204를 반환하고 이후 GET에서 변경이 반영된다', async () => {
      const { accessToken } = await registerAndLogin();

      await request(app.getHttpServer())
        .patch('/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '변경된이름' })
        .expect(204);

      const profileRes = await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(profileRes.body.name).toBe('변경된이름');
    });

    it('현재 name과 동일한 값으로 PATCH 해도 204를 반환한다 (멱등성)', async () => {
      const { accessToken } = await registerAndLogin();

      await request(app.getHttpServer())
        .patch('/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: defaultUser.name })
        .expect(204);

      const profileRes = await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(profileRes.body.name).toBe(defaultUser.name);
    });

    it('name이 빈 문자열이면 400을 반환한다', async () => {
      const { accessToken } = await registerAndLogin();

      return request(app.getHttpServer())
        .patch('/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '' })
        .expect(400);
    });

    it('name이 31자이면 400을 반환한다', async () => {
      const { accessToken } = await registerAndLogin();

      return request(app.getHttpServer())
        .patch('/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'a'.repeat(31) })
        .expect(400);
    });
  });

  // ============================================================
  // POST /auth/logout
  // ============================================================
  describe('POST /auth/logout', () => {
    it('should return 204 on successful logout', async () => {
      const { accessToken } = await registerAndLogin();

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('should invalidate refresh token after logout', async () => {
      const { accessToken, refreshToken } = await registerAndLogin();

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('should return 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer()).post('/v1/auth/logout').expect(401);
    });

    it('should return 401 when an invalid token is provided', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
