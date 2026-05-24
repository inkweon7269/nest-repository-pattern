import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from '../setup/integration-helper';
import { AppModule } from '../../apps/service/src/app.module';

describe('Tags (integration)', () => {
  let app: INestApplication<App>;
  let txHelper: TransactionHelper;

  beforeAll(async () => {
    app = await createIntegrationApp(AppModule);
    txHelper = useTransactionRollback(app);
  });

  beforeEach(() => txHelper.start());
  afterEach(() => txHelper.rollback());

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── 헬퍼 ─────────────────────────────────

  const defaultUser = {
    email: 'tag-test@example.com',
    password: 'password123',
    name: '테스트유저',
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

  function createTag(token: string, body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ name: 'default-tag', ...body });
  }

  // ============================================================
  // 인증 없이 요청 시 401
  // ============================================================
  describe('Authentication required', () => {
    it('토큰 없이 GET /tags 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer()).get('/v1/tags').expect(401);
    });

    it('토큰 없이 GET /tags/:id 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer()).get('/v1/tags/1').expect(401);
    });

    it('토큰 없이 POST /tags 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/tags')
        .send({ name: 'nestjs' })
        .expect(401);
    });

    it('토큰 없이 PATCH /tags/:id 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/tags/1')
        .send({ name: 'nestjs' })
        .expect(401);
    });

    it('토큰 없이 DELETE /tags/:id 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer()).delete('/v1/tags/1').expect(401);
    });
  });

  // ============================================================
  // POST /tags
  // ============================================================
  describe('POST /tags', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('태그를 생성하고 { id }를 반환한다', async () => {
      const res = await createTag(token, { name: 'nestjs' }).expect(201);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('생성한 태그는 GET으로 조회된다', async () => {
      const createRes = await createTag(token, { name: 'nestjs' }).expect(201);
      const id = createRes.body.id as number;

      const getRes = await request(app.getHttpServer())
        .get(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.id).toBe(id);
      expect(getRes.body.name).toBe('nestjs');
      expect(typeof getRes.body.userId).toBe('number');
      expect(getRes.body.createdAt).toBeDefined();
      expect(getRes.body.updatedAt).toBeDefined();
    });

    it('같은 사용자가 중복된 이름으로 생성하면 409를 반환한다', async () => {
      await createTag(token, { name: 'duplicate' }).expect(201);

      const res = await createTag(token, { name: 'duplicate' }).expect(409);

      expect(res.body.message).toContain('duplicate');
    });

    it('다른 사용자는 동일한 이름의 태그를 생성할 수 있다 (사용자별 격리)', async () => {
      await createTag(token, { name: 'shared' }).expect(201);

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      await createTag(tokens2.accessToken, { name: 'shared' }).expect(201);
    });

    it('이름이 빈 문자열이면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/tags')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ name: '' })
        .expect(400);
    });

    it('이름 필드가 누락되면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/tags')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({})
        .expect(400);
    });

    it('이름이 51자이면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/tags')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ name: 'a'.repeat(51) })
        .expect(400);
    });

    it('이름이 50자이면 201을 반환한다 (최대 길이 허용)', async () => {
      const maxName = 'a'.repeat(50);
      const createRes = await createTag(token, { name: maxName }).expect(201);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/tags/${createRes.body.id as number}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.name).toBe(maxName);
    });

    it('허용되지 않은 속성이 포함되면 400을 반환한다 (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/v1/tags')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ name: 'nestjs', hacked: true })
        .expect(400);
    });
  });

  // ============================================================
  // GET /tags (pagination)
  // ============================================================
  describe('GET /tags', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('기본 page=1, limit=10으로 페이지네이션 응답을 반환한다', async () => {
      await createTag(token, { name: 'tag-a' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/tags')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(10);
      expect(res.body.meta.totalElements).toBe(1);
      expect(res.body.meta.totalPages).toBe(1);
      expect(res.body.meta.isFirst).toBe(true);
      expect(res.body.meta.isLast).toBe(true);
    });

    it('태그가 없으면 빈 items를 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tags')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta.totalElements).toBe(0);
      expect(res.body.meta.totalPages).toBe(0);
    });

    it('custom page와 limit으로 페이지네이션한다', async () => {
      for (let i = 0; i < 5; i++) {
        await createTag(token, { name: `tag-${i + 1}` }).expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/v1/tags?page=2&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.totalElements).toBe(5);
      expect(res.body.meta.totalPages).toBe(3);
      expect(res.body.meta.isFirst).toBe(false);
      expect(res.body.meta.isLast).toBe(false);
    });

    it('인증된 사용자가 생성한 태그만 반환한다 (사용자 격리)', async () => {
      await createTag(token, { name: 'my-tag' }).expect(201);

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });
      await createTag(tokens2.accessToken, { name: 'other-tag' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/tags')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('my-tag');
      expect(res.body.meta.totalElements).toBe(1);
    });

    it('다른 사용자의 태그는 보이지 않는다', async () => {
      await createTag(token, { name: 'user1-tag' }).expect(201);

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      const res = await request(app.getHttpServer())
        .get('/v1/tags')
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.meta.totalElements).toBe(0);
    });
  });

  // ============================================================
  // GET /tags/:id
  // ============================================================
  describe('GET /tags/:id', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('존재하지 않는 태그를 조회하면 404를 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/tags/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('다른 사용자의 태그를 조회하면 404를 반환한다', async () => {
      const createRes = await createTag(token, { name: 'private' }).expect(201);
      const id = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      await request(app.getHttpServer())
        .get(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .expect(404);
    });

    it('숫자가 아닌 id면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/tags/abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  // ============================================================
  // PATCH /tags/:id
  // ============================================================
  describe('PATCH /tags/:id', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('태그 이름을 수정하고 204를 반환하며 GET에 반영된다', async () => {
      const createRes = await createTag(token, { name: 'before' }).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'after' })
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.name).toBe('after');
    });

    it('존재하지 않는 태그를 수정하면 404를 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/tags/99999')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'whatever' })
        .expect(404);
    });

    it('다른 사용자의 태그를 수정하면 404를 반환한다', async () => {
      const createRes = await createTag(token, { name: 'mine' }).expect(201);
      const id = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      await request(app.getHttpServer())
        .patch(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .send({ name: 'hijacked' })
        .expect(404);
    });

    it('이미 존재하는 이름으로 수정하면 409를 반환한다', async () => {
      await createTag(token, { name: 'existing' }).expect(201);
      const createRes = await createTag(token, { name: 'target' }).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'existing' })
        .expect(409);
    });

    it('이름이 빈 문자열이면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/tags/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' })
        .expect(400);
    });

    it('이름이 51자이면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/tags/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'a'.repeat(51) })
        .expect(400);
    });

    it('숫자가 아닌 id면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/tags/abc')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'valid' })
        .expect(400);
    });
  });

  // ============================================================
  // DELETE /tags/:id
  // ============================================================
  describe('DELETE /tags/:id', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('태그를 삭제하고 204를 반환하며 이후 GET은 404가 된다', async () => {
      const createRes = await createTag(token, { name: 'delete-me' }).expect(
        201,
      );
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('존재하지 않는 태그를 삭제하면 404를 반환한다', () => {
      return request(app.getHttpServer())
        .delete('/v1/tags/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('다른 사용자의 태그를 삭제하면 404를 반환한다', async () => {
      const createRes = await createTag(token, { name: 'mine' }).expect(201);
      const id = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      await request(app.getHttpServer())
        .delete(`/v1/tags/${id}`)
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .expect(404);
    });

    it('숫자가 아닌 id면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .delete('/v1/tags/abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });
});
