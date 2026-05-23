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
import { MockGoogleLinkStrategy } from '../setup/google-link-strategy.mock';
import { AppModule } from '../../apps/service/src/app.module';
import { GoogleStrategy } from '../../apps/service/src/auth/strategy/google.strategy';
import { GoogleLinkStrategy } from '../../apps/service/src/auth/strategy/google-link.strategy';
import { OAuthAccount, User } from '@app/shared';

describe('Google OAuth (integration)', () => {
  let app: INestApplication<App>;
  let txHelper: TransactionHelper;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createIntegrationApp(AppModule, {
      overrideProviders: [
        { provide: GoogleStrategy, useClass: MockGoogleStrategy },
        { provide: GoogleLinkStrategy, useClass: MockGoogleLinkStrategy },
      ],
    });
    txHelper = useTransactionRollback(app);
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    MockGoogleStrategy.profile = null;
    MockGoogleLinkStrategy.profile = null;
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
      .send({ email, password, name, marketingConsent: true })
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
  // POST /v1/auth/google/link  &  GET /link/callback
  // ============================================================
  describe('POST /v1/auth/google/link (계정 연결 시작)', () => {
    async function getLocalUserAccessToken(
      email = 'local-user@example.com',
    ): Promise<string> {
      await registerLocalUser(email);
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);
      return loginRes.body.accessToken as string;
    }

    it('인증 없이 호출하면 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/google/link')
        .expect(401);
    });

    it('인증된 사용자가 호출하면 200 JSON으로 authorizationUrl을 반환한다', async () => {
      const accessToken = await getLocalUserAccessToken();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('authorizationUrl');
      expect(res.body.authorizationUrl).toContain('accounts.google.com');

      const url = new URL(res.body.authorizationUrl);
      const stateParam = url.searchParams.get('state');
      expect(stateParam).toBeTruthy();
      // state는 JWT 형태(3 segment, dot 2개)
      expect(stateParam!.split('.').length).toBe(3);

      // OAuth 표준 query 파라미터 모두 포함
      expect(url.searchParams.get('client_id')).toBeTruthy();
      expect(url.searchParams.get('redirect_uri')).toBeTruthy();
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
    });
  });

  describe('GET /v1/auth/google/link/callback', () => {
    async function startLinkAndCaptureState(): Promise<{
      stateToken: string;
      accessToken: string;
      userId: number;
    }> {
      await registerLocalUser('linker@example.com');
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'linker@example.com', password: 'password123' })
        .expect(200);
      const accessToken = loginRes.body.accessToken as string;

      const startRes = await request(app.getHttpServer())
        .post('/v1/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const url = new URL(startRes.body.authorizationUrl);
      const stateToken = url.searchParams.get('state')!;

      const user = await dataSource
        .getRepository(User)
        .findOneByOrFail({ email: 'linker@example.com' });

      return { stateToken, accessToken, userId: user.id };
    }

    it('정상 link → oauth_accounts 레코드 생성 + #linked=true로 redirect', async () => {
      const { stateToken, userId } = await startLinkAndCaptureState();

      MockGoogleLinkStrategy.profile = {
        providerId: 'google-link-sub-1',
        email: 'gmail-account@example.com',
        emailVerified: true,
        displayName: 'Google 사용자',
      };

      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/link/callback')
        .query({ state: stateToken })
        .expect(302);

      expect(parseFragment(res.headers.location).linked).toBe('true');

      const oauth = await dataSource.getRepository(OAuthAccount).findOneBy({
        userId,
        provider: 'google',
      });
      expect(oauth).not.toBeNull();
      expect(oauth!.providerId).toBe('google-link-sub-1');
      expect(oauth!.providerEmail).toBe('gmail-account@example.com');
    });

    it('미검증 이메일이면 #error=email_not_verified로 redirect하고 oauth_accounts를 생성하지 않는다', async () => {
      const { stateToken, userId } = await startLinkAndCaptureState();

      MockGoogleLinkStrategy.profile = {
        providerId: 'google-link-sub-2',
        email: 'unverified@example.com',
        emailVerified: false,
        displayName: '미검증',
      };

      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/link/callback')
        .query({ state: stateToken })
        .expect(302);

      expect(parseFragment(res.headers.location).error).toBe(
        'email_not_verified',
      );

      const oauthCount = await dataSource
        .getRepository(OAuthAccount)
        .count({ where: { userId, provider: 'google' } });
      expect(oauthCount).toBe(0);
    });

    it('동일 Google 계정이 다른 사용자에 이미 연결되어 있으면 #error=link_conflict로 redirect한다', async () => {
      // 1) 다른 사용자 A를 신규 가입(Google 콜백)으로 만들어 oauth_accounts 1건 생성
      MockGoogleStrategy.profile = {
        providerId: 'shared-google-sub',
        email: 'first-owner@example.com',
        emailVerified: true,
        displayName: 'First Owner',
      };
      await request(app.getHttpServer())
        .get('/v1/auth/google/callback')
        .expect(302);

      // 2) 사용자 B(linker@example.com)가 동일 google sub로 link 시도
      const { stateToken } = await startLinkAndCaptureState();
      MockGoogleLinkStrategy.profile = {
        providerId: 'shared-google-sub',
        email: 'first-owner@example.com',
        emailVerified: true,
        displayName: 'First Owner',
      };

      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/link/callback')
        .query({ state: stateToken })
        .expect(302);

      expect(parseFragment(res.headers.location).error).toBe('link_conflict');
    });

    it('본인이 이미 동일 provider에 연결되어 있으면 #error=link_conflict', async () => {
      const { stateToken, userId } = await startLinkAndCaptureState();

      // 사전 — 본인 userId에 google oauth_account 직접 삽입
      await dataSource.getRepository(OAuthAccount).save({
        userId,
        provider: 'google',
        providerId: 'pre-existing-sub',
        providerEmail: 'pre@example.com',
        emailVerified: true,
      });

      MockGoogleLinkStrategy.profile = {
        providerId: 'another-google-sub',
        email: 'another@example.com',
        emailVerified: true,
        displayName: 'Another',
      };

      const res = await request(app.getHttpServer())
        .get('/v1/auth/google/link/callback')
        .query({ state: stateToken })
        .expect(302);

      expect(parseFragment(res.headers.location).error).toBe('link_conflict');
    });

    it('state 토큰 없이 콜백을 호출하면 401', async () => {
      MockGoogleLinkStrategy.profile = {
        providerId: 'whatever',
        email: 'whatever@example.com',
        emailVerified: true,
        displayName: 'X',
      };
      await request(app.getHttpServer())
        .get('/v1/auth/google/link/callback')
        .expect(401);
    });

    it('변조된 state 토큰을 보내면 401', async () => {
      MockGoogleLinkStrategy.profile = {
        providerId: 'whatever',
        email: 'whatever@example.com',
        emailVerified: true,
        displayName: 'X',
      };
      await request(app.getHttpServer())
        .get('/v1/auth/google/link/callback')
        .query({ state: 'tampered.invalid.token' })
        .expect(401);
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
