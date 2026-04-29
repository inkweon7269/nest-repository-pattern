import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from '../setup/integration-helper';
import { MockGoogleStrategy } from '../setup/google-strategy.mock';
import { AppModule } from '../../apps/service/src/app.module';
import { GoogleStrategy } from '../../apps/service/src/auth/strategy/google.strategy';
import { OAuthAccount, User } from '@app/shared';

describe('Google OAuth (integration)', () => {
  let app: INestApplication<App>;
  let txHelper: TransactionHelper;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createIntegrationApp(AppModule, {
      overrideProviders: [
        { provide: GoogleStrategy, useClass: MockGoogleStrategy },
      ],
    });
    txHelper = useTransactionRollback(app);
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    MockGoogleStrategy.profile = null;
    await txHelper.start();
  });

  afterEach(() => txHelper.rollback());

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── 헬퍼 ─────────────────────────────────

  const validProfile = {
    providerId: 'google-sub-123',
    email: 'newuser@example.com',
    emailVerified: true,
    displayName: 'Google 사용자',
  };

  function setProfile(overrides: Partial<typeof validProfile> = {}) {
    MockGoogleStrategy.profile = { ...validProfile, ...overrides };
  }

  async function registerLocalUser(
    email: string,
    password = 'password123',
    name = '로컬 사용자',
  ) {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password, name })
      .expect(201);
  }

  function parseFragment(location: string): Record<string, string> {
    const hashIndex = location.indexOf('#');
    if (hashIndex === -1) return {};
    const fragment = location.slice(hashIndex + 1);
    return Object.fromEntries(new URLSearchParams(fragment));
  }

  // ============================================================
  // GET /v1/auth/google
  // ============================================================
  describe('GET /v1/auth/google', () => {
    it('Google OAuth 시작 시 외부 OAuth URL로 redirect한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/google')
        .expect(302);

      expect(res.headers.location).toContain('accounts.google.com');
    });
  });

  // ============================================================
  // GET /v1/auth/google/callback - 신규 가입
  // ============================================================
  describe('GET /v1/auth/google/callback (신규 가입)', () => {
    it('연결된 OAuthAccount가 없고 동일 이메일도 없으면 신규 User+OAuthAccount를 생성하고 토큰 fragment로 redirect한다', async () => {
      setProfile();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/callback')
        .expect(302);

      const fragment = parseFragment(res.headers.location);
      expect(fragment.accessToken).toBeDefined();
      expect(fragment.refreshToken).toBeDefined();
      expect(fragment.error).toBeUndefined();

      const user = await dataSource
        .getRepository(User)
        .findOneBy({ email: validProfile.email });
      expect(user).not.toBeNull();
      expect(user!.name).toBe(validProfile.displayName);

      const oauth = await dataSource.getRepository(OAuthAccount).findOneBy({
        provider: 'google',
        providerId: validProfile.providerId,
      });
      expect(oauth).not.toBeNull();
      expect(oauth!.userId).toBe(user!.id);
      expect(oauth!.providerEmail).toBe(validProfile.email);
      expect(oauth!.emailVerified).toBe(true);
    });
  });

  // ============================================================
  // GET /v1/auth/google/callback - 재로그인
  // ============================================================
  describe('GET /v1/auth/google/callback (기존 OAuth 사용자 재로그인)', () => {
    it('동일 providerId로 재진입 시 기존 user.id로 토큰을 발급하고 oauth_accounts 중복 생성하지 않는다', async () => {
      setProfile();

      // 1차 — 신규 가입
      await request(app.getHttpServer())
        .get('/v1/auth/google/callback')
        .expect(302);
      const firstUser = await dataSource
        .getRepository(User)
        .findOneBy({ email: validProfile.email });

      // 2차 — 동일 Google 계정으로 재진입
      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/callback')
        .expect(302);

      const fragment = parseFragment(res.headers.location);
      expect(fragment.accessToken).toBeDefined();
      expect(fragment.error).toBeUndefined();

      const userCount = await dataSource
        .getRepository(User)
        .count({ where: { email: validProfile.email } });
      expect(userCount).toBe(1);

      const oauthCount = await dataSource.getRepository(OAuthAccount).count({
        where: { provider: 'google', providerId: validProfile.providerId },
      });
      expect(oauthCount).toBe(1);

      const persistedOauth = await dataSource
        .getRepository(OAuthAccount)
        .findOneBy({
          provider: 'google',
          providerId: validProfile.providerId,
        });
      expect(persistedOauth!.userId).toBe(firstUser!.id);
    });
  });

  // ============================================================
  // GET /v1/auth/google/callback - 동일 이메일 충돌
  // ============================================================
  describe('GET /v1/auth/google/callback (동일 이메일 비번 사용자 충돌)', () => {
    it('OAuthAccount는 없지만 동일 이메일 User가 있으면 #error=email_already_exists로 redirect한다', async () => {
      await registerLocalUser(validProfile.email);
      setProfile();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/callback')
        .expect(302);

      const fragment = parseFragment(res.headers.location);
      expect(fragment.error).toBe('email_already_exists');
      expect(fragment.email).toBe(validProfile.email);
      expect(fragment.accessToken).toBeUndefined();

      const oauthCount = await dataSource.getRepository(OAuthAccount).count({
        where: { provider: 'google', providerId: validProfile.providerId },
      });
      expect(oauthCount).toBe(0);
    });
  });

  // ============================================================
  // GET /v1/auth/google/callback - 미검증 이메일
  // ============================================================
  describe('GET /v1/auth/google/callback (미검증 이메일)', () => {
    it('emailVerified가 false면 #error=email_not_verified로 redirect한다', async () => {
      setProfile({ emailVerified: false });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/callback')
        .expect(302);

      const fragment = parseFragment(res.headers.location);
      expect(fragment.error).toBe('email_not_verified');
      expect(fragment.accessToken).toBeUndefined();

      const userCount = await dataSource
        .getRepository(User)
        .count({ where: { email: validProfile.email } });
      expect(userCount).toBe(0);
    });
  });

  // ============================================================
  // DELETE /v1/auth/google/unlink
  // ============================================================
  describe('DELETE /v1/auth/google/unlink', () => {
    async function googleLoginAndGetTokens() {
      setProfile();
      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/callback')
        .expect(302);
      const fragment = parseFragment(res.headers.location);
      return {
        accessToken: fragment.accessToken,
        refreshToken: fragment.refreshToken,
      };
    }

    it('인증 없이 호출하면 401', async () => {
      await request(app.getHttpServer())
        .delete('/v1/auth/google/unlink')
        .expect(401);
    });

    it('연결된 Google 계정이 있으면 204를 반환하고 oauth_accounts 레코드를 삭제한다', async () => {
      const { accessToken } = await googleLoginAndGetTokens();

      await request(app.getHttpServer())
        .delete('/v1/auth/google/unlink')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const oauthCount = await dataSource.getRepository(OAuthAccount).count({
        where: { provider: 'google', providerId: validProfile.providerId },
      });
      expect(oauthCount).toBe(0);
    });

    it('연결된 Google 계정이 없으면 404', async () => {
      // 비번 가입 후 unlink 시도 (OAuth 미연결 상태)
      await registerLocalUser('local-only@example.com');
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'local-only@example.com', password: 'password123' })
        .expect(200);
      const accessToken = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .delete('/v1/auth/google/unlink')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('unlink 후 동일 Google 계정으로 재진입 시 신규 가입 분기로 다시 진입한다', async () => {
      const { accessToken } = await googleLoginAndGetTokens();

      await request(app.getHttpServer())
        .delete('/v1/auth/google/unlink')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // unlink 후 같은 이메일이 users에 남아있으므로 충돌 분기에 진입해야 함
      setProfile();
      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/callback')
        .expect(302);

      const fragment = parseFragment(res.headers.location);
      expect(fragment.error).toBe('email_already_exists');
    });
  });
});
