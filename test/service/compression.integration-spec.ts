import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from '../setup/integration-helper';
import { ServiceAppModule } from '../../apps/service/src/app.module';

describe('Compression (integration)', () => {
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
    email: 'compression-test@example.com',
    password: 'password123',
    name: '테스트유저',
    marketingConsent: true,
  };

  async function registerAndLogin(body: Record<string, unknown> = {}) {
    const user = { ...defaultUser, ...body };
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(user)
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    return loginRes.body as { accessToken: string; refreshToken: string };
  }

  function createPost(token: string, body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ title: 'Default Title', content: 'Default Content', ...body });
  }

  it('1KB 초과 응답은 gzip으로 압축하여 content-encoding: gzip을 설정한다', async () => {
    const { accessToken } = await registerAndLogin();
    const longContent = 'a'.repeat(2000);
    const createRes = await createPost(accessToken, {
      title: 'Large Post',
      content: longContent,
    }).expect(201);
    const id = createRes.body.id as number;

    const res = await request(app.getHttpServer())
      .get(`/v1/posts/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.headers['content-encoding']).toBe('gzip');
    // supertest가 자동 해제하므로 body도 정상 파싱되어야 한다
    expect(res.body.id).toBe(id);
    expect(res.body.content).toBe(longContent);
  });

  it('threshold(1KB) 미만 응답은 압축하지 않아 content-encoding 헤더가 없다', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('compression 미들웨어가 적용되어 작은 응답에도 Vary: Accept-Encoding을 추가한다', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.headers['vary']).toContain('Accept-Encoding');
  });
});
