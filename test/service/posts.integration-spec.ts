import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from '../setup/integration-helper';
import { ServiceAppModule } from '../../apps/service/src/app.module';

describe('Posts (integration)', () => {
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
    email: 'post-test@example.com',
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

  async function createAndGet(
    token: string,
    body: Record<string, unknown> = {},
  ) {
    const createRes = await createPost(token, body).expect(201);
    const id = createRes.body.id as number;
    const getRes = await request(app.getHttpServer())
      .get(`/v1/posts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return getRes;
  }

  // ============================================================
  // 인증 없이 요청 시 401
  // ============================================================
  describe('Authentication required', () => {
    it('토큰 없이 GET /posts 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer()).get('/v1/posts').expect(401);
    });

    it('토큰 없이 GET /posts/:id 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer()).get('/v1/posts/1').expect(401);
    });

    it('토큰 없이 POST /posts 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/posts')
        .send({ title: 'Test', content: 'Content' })
        .expect(401);
    });

    it('토큰 없이 PATCH /posts/:id 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/posts/1')
        .send({ title: 'Test', content: 'Content', isPublished: false })
        .expect(401);
    });

    it('토큰 없이 DELETE /posts/:id 호출 시 401을 반환한다', () => {
      return request(app.getHttpServer()).delete('/v1/posts/1').expect(401);
    });
  });

  // ============================================================
  // POST /posts
  // ============================================================
  describe('POST /posts', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('게시글을 생성하고 { id }를 반환한다', async () => {
      const res = await createPost(token, {
        title: 'Integration Test',
        content: 'Real DB',
      }).expect(201);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('생성한 게시글이 DB에 저장된다 (GET으로 검증)', async () => {
      const getRes = await createAndGet(token, {
        title: 'Integration Test',
        content: 'Real DB',
      });

      expect(getRes.body.title).toBe('Integration Test');
      expect(getRes.body.content).toBe('Real DB');
      expect(getRes.body.isPublished).toBe(false);
    });

    it('인증된 사용자의 userId가 저장된다', async () => {
      const getRes = await createAndGet(token, {
        title: 'With Author',
        content: 'Content',
      });

      expect(getRes.body.userId).toBeDefined();
      expect(typeof getRes.body.userId).toBe('number');
    });

    it('id, createdAt, updatedAt이 자동 생성된다', async () => {
      const getRes = await createAndGet(token);

      expect(typeof getRes.body.id).toBe('number');
      expect(getRes.body.id).toBeGreaterThan(0);
      expect(getRes.body.createdAt).toBeDefined();
      expect(getRes.body.updatedAt).toBeDefined();
      expect(new Date(getRes.body.createdAt as string).getTime()).not.toBeNaN();
      expect(new Date(getRes.body.updatedAt as string).getTime()).not.toBeNaN();
    });

    it('isPublished를 보내지 않으면 기본값 false로 저장된다', async () => {
      const getRes = await createAndGet(token, {
        title: 'No publish flag',
        content: 'Content',
      });

      expect(getRes.body.isPublished).toBe(false);
    });

    it('isPublished: true로 게시글을 생성한다', async () => {
      const getRes = await createAndGet(token, { isPublished: true });

      expect(getRes.body.isPublished).toBe(true);
    });

    it('컬럼 최대 길이(200자)의 title을 허용한다', async () => {
      const maxTitle = 'A'.repeat(200);
      const getRes = await createAndGet(token, { title: maxTitle });

      expect(getRes.body.title).toBe(maxTitle);
    });

    it('여러 번 생성하면 id가 순차적으로 증가한다', async () => {
      const res1 = await createPost(token, { title: 'First' }).expect(201);
      const res2 = await createPost(token, { title: 'Second' }).expect(201);

      expect(res2.body.id).toBeGreaterThan(res1.body.id as number);
    });

    it('title이 없으면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'No title' })
        .expect(400);
    });

    it('content가 없으면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'No content' })
        .expect(400);
    });

    it('body가 비어 있으면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .post('/v1/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('정의되지 않은 속성이 있으면 400을 반환한다 (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/v1/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Post', content: 'Content', hacked: true })
        .expect(400);
    });

    it('같은 사용자가 중복 title로 게시글을 생성하면 409를 반환한다', async () => {
      await createPost(token, {
        title: 'Unique Title',
        content: 'First',
      }).expect(201);

      const res = await createPost(token, {
        title: 'Unique Title',
        content: 'Second',
      }).expect(409);

      expect(res.body.message).toContain('Unique Title');
    });

    it('서로 다른 사용자는 같은 title로 게시글을 생성할 수 있다', async () => {
      await createPost(token, {
        title: 'Shared Title',
        content: 'User 1',
      }).expect(201);

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      await createPost(tokens2.accessToken, {
        title: 'Shared Title',
        content: 'User 2',
      }).expect(201);
    });
  });

  // ============================================================
  // GET /posts (pagination)
  // ============================================================
  describe('GET /posts', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('기본값 page=1, limit=10으로 페이지네이션 응답을 반환한다', async () => {
      await createPost(token, { title: 'Post A' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/posts')
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

    it('게시글이 없으면 빈 items를 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta.totalElements).toBe(0);
      expect(res.body.meta.totalPages).toBe(0);
    });

    it('지정한 page와 limit으로 페이지네이션한다', async () => {
      for (let i = 0; i < 5; i++) {
        await createPost(token, { title: `Post ${i + 1}` }).expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/v1/posts?page=2&limit=2')
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

    it('items를 id DESC 순서로 반환한다 (최신순)', async () => {
      await createPost(token, { title: 'First' }).expect(201);
      await createPost(token, { title: 'Second' }).expect(201);
      await createPost(token, { title: 'Third' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/posts?limit=3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items[0].title).toBe('Third');
      expect(res.body.items[1].title).toBe('Second');
      expect(res.body.items[2].title).toBe('First');
    });

    it('마지막 페이지를 올바르게 표시한다', async () => {
      for (let i = 0; i < 3; i++) {
        await createPost(token, { title: `Post ${i + 1}` }).expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/v1/posts?page=2&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.meta.isLast).toBe(true);
      expect(res.body.meta.isFirst).toBe(false);
    });

    it('items가 올바른 응답 형태를 가진다', async () => {
      await createPost(token).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const post = res.body.items[0];
      expect(post).toHaveProperty('id');
      expect(post).toHaveProperty('userId');
      expect(post).toHaveProperty('title');
      expect(post).toHaveProperty('content');
      expect(post).toHaveProperty('isPublished');
      expect(post).toHaveProperty('createdAt');
      expect(post).toHaveProperty('updatedAt');
    });

    it('page가 0이면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/posts?page=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('limit이 100을 초과하면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/posts?limit=101')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('page가 숫자가 아니면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/posts?page=abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('isPublished=true로 필터링한다', async () => {
      await createPost(token, {
        title: 'Published',
        isPublished: true,
      }).expect(201);
      await createPost(token, {
        title: 'Draft',
        isPublished: false,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/posts?isPublished=true')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Published');
      expect(res.body.meta.totalElements).toBe(1);
    });

    it('isPublished=false로 필터링한다', async () => {
      await createPost(token, {
        title: 'Published',
        isPublished: true,
      }).expect(201);
      await createPost(token, { title: 'Draft' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/posts?isPublished=false')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Draft');
      expect(res.body.meta.totalElements).toBe(1);
    });

    it('isPublished 필터와 페이지네이션을 함께 적용한다', async () => {
      for (let i = 0; i < 5; i++) {
        await createPost(token, {
          title: `Published ${i}`,
          isPublished: true,
        }).expect(201);
      }
      await createPost(token, { title: 'Draft' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/posts?isPublished=true&limit=2&page=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.meta.totalElements).toBe(5);
      expect(res.body.meta.totalPages).toBe(3);
    });

    it('isPublished 값이 유효하지 않으면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/posts?isPublished=notabool')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('인증된 사용자가 생성한 게시글만 반환한다', async () => {
      await createPost(token, { title: 'My Post' }).expect(201);

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });
      await createPost(tokens2.accessToken, { title: 'Other Post' }).expect(
        201,
      );

      const res = await request(app.getHttpServer())
        .get('/v1/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('My Post');
      expect(res.body.meta.totalElements).toBe(1);
    });

    it('다른 사용자의 게시글이 있어도 본인 게시글이 없으면 빈 결과를 반환한다', async () => {
      await createPost(token, { title: 'User 1 Post' }).expect(201);

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      const res = await request(app.getHttpServer())
        .get('/v1/posts')
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.meta.totalElements).toBe(0);
    });
  });

  // ============================================================
  // GET /posts/:id
  // ============================================================
  describe('GET /posts/:id', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('id로 게시글을 조회한다', async () => {
      const createRes = await createPost(token, {
        title: 'Find Me',
        content: 'By ID',
      }).expect(201);

      const id = createRes.body.id as number;
      const res = await request(app.getHttpServer())
        .get(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.id).toBe(id);
      expect(res.body.title).toBe('Find Me');
      expect(res.body.content).toBe('By ID');
    });

    it('모든 엔티티 필드를 올바르게 반환한다', async () => {
      const createRes = await createPost(token, {
        title: 'Full Fields',
        content: 'Check all',
        isPublished: true,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/posts/${createRes.body.id as number}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.title).toBe('Full Fields');
      expect(res.body.content).toBe('Check all');
      expect(res.body.isPublished).toBe(true);
      expect(typeof res.body.id).toBe('number');
      expect(typeof res.body.userId).toBe('number');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it('게시글이 존재하지 않으면 404를 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/posts/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it('다른 사용자의 게시글을 조회하면 404를 반환한다', async () => {
      const createRes = await createPost(token, {
        title: 'Private Post',
        content: 'Owner Only',
      }).expect(201);
      const id = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      await request(app.getHttpServer())
        .get(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .expect(404);
    });

    it('id가 숫자가 아니면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .get('/v1/posts/abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  // ============================================================
  // PATCH /posts/:id
  // ============================================================
  describe('PATCH /posts/:id', () => {
    let token: string;

    const fullUpdate = {
      title: 'Updated Title',
      content: 'Updated Content',
      isPublished: true,
    };

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('모든 필드를 수정하고 204를 반환한다', async () => {
      const createRes = await createPost(token).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(fullUpdate)
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.title).toBe('Updated Title');
      expect(getRes.body.content).toBe('Updated Content');
      expect(getRes.body.isPublished).toBe(true);
    });

    it('게시글이 존재하지 않으면 404를 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/posts/99999')
        .set('Authorization', `Bearer ${token}`)
        .send(fullUpdate)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it('다른 사용자의 게시글을 수정하면 404를 반환한다', async () => {
      const createRes = await createPost(token).expect(201);
      const id = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      return request(app.getHttpServer())
        .patch(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .send(fullUpdate)
        .expect(404);
    });

    it('id가 숫자가 아니면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/posts/abc')
        .set('Authorization', `Bearer ${token}`)
        .send(fullUpdate)
        .expect(400);
    });

    it('body에 정의되지 않은 속성이 있으면 400을 반환한다 (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .patch('/v1/posts/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...fullUpdate, hacked: true })
        .expect(400);
    });

    it('필수 필드가 없으면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/posts/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Only Title' })
        .expect(400);
    });

    it('title이 빈 문자열이면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/posts/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '', content: 'Content', isPublished: false })
        .expect(400);
    });

    it('content가 빈 문자열이면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .patch('/v1/posts/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Title', content: '', isPublished: false })
        .expect(400);
    });
  });

  // ============================================================
  // DELETE /posts/:id
  // ============================================================
  describe('DELETE /posts/:id', () => {
    let token: string;

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('게시글을 삭제하고 204를 반환한다', async () => {
      const createRes = await createPost(token).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('게시글이 존재하지 않으면 404를 반환한다', () => {
      return request(app.getHttpServer())
        .delete('/v1/posts/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it('다른 사용자의 게시글을 삭제하면 404를 반환한다', async () => {
      const createRes = await createPost(token).expect(201);
      const id = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      return request(app.getHttpServer())
        .delete(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .expect(404);
    });

    it('id가 숫자가 아니면 400을 반환한다', () => {
      return request(app.getHttpServer())
        .delete('/v1/posts/abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('soft-delete 후 같은 title로 게시글을 생성할 수 있다', async () => {
      const createRes = await createPost(token, {
        title: 'Reusable Title',
        content: 'Original',
      }).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/v1/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const newRes = await createPost(token, {
        title: 'Reusable Title',
        content: 'Recreated',
      }).expect(201);

      expect(newRes.body.id).not.toBe(id);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/posts/${newRes.body.id as number}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.title).toBe('Reusable Title');
      expect(getRes.body.content).toBe('Recreated');
    });

    it('삭제 시 다른 게시글에 영향을 주지 않는다', async () => {
      const res1 = await createPost(token, { title: 'Keep' }).expect(201);
      const res2 = await createPost(token, { title: 'Delete Me' }).expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/posts/${res2.body.id as number}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/posts/${res1.body.id as number}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.title).toBe('Keep');
    });
  });

  // ============================================================
  // Posts ↔ Tags (M:N integration)
  // ============================================================
  describe('Posts <-> Tags', () => {
    let token: string;

    function createTag(t: string, name: string) {
      return request(app.getHttpServer())
        .post('/v1/tags')
        .set('Authorization', `Bearer ${t}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ name });
    }

    async function createTagAndGetId(t: string, name: string): Promise<number> {
      const res = await createTag(t, name).expect(201);
      return res.body.id as number;
    }

    beforeEach(async () => {
      const tokens = await registerAndLogin();
      token = tokens.accessToken;
    });

    it('소유한 tagIds로 게시글을 생성하면 GET 시 tags가 채워진다', async () => {
      const tagId1 = await createTagAndGetId(token, 'nestjs');
      const tagId2 = await createTagAndGetId(token, 'typescript');

      const getRes = await createAndGet(token, {
        title: 'Tagged Post',
        tagIds: [tagId1, tagId2],
      });

      expect(getRes.body.tags).toHaveLength(2);
      const names = (getRes.body.tags as Array<{ name: string }>)
        .map((t) => t.name)
        .sort();
      expect(names).toEqual(['nestjs', 'typescript']);
    });

    it('tagIds가 없으면 tags는 빈 배열이다', async () => {
      const getRes = await createAndGet(token, { title: 'No Tags' });

      expect(getRes.body.tags).toEqual([]);
    });

    it('소유하지 않은 tagId로 게시글을 생성하면 400을 반환한다', async () => {
      const ownTagId = await createTagAndGetId(token, 'mine');

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });
      const otherTagId = await createTagAndGetId(tokens2.accessToken, 'theirs');

      await createPost(token, {
        title: 'Steal Tag',
        tagIds: [ownTagId, otherTagId],
      }).expect(400);
    });

    it('존재하지 않는 tagId로 게시글을 생성하면 400을 반환한다', async () => {
      await createPost(token, {
        title: 'Ghost Tag',
        tagIds: [99999],
      }).expect(400);
    });

    it('소유하지 않은 tagId로 게시글을 수정하면 400을 반환한다', async () => {
      const createRes = await createPost(token, { title: 'Editable' }).expect(
        201,
      );
      const postId = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });
      const otherTagId = await createTagAndGetId(tokens2.accessToken, 'theirs');

      await request(app.getHttpServer())
        .patch(`/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Editable',
          content: 'Default Content',
          isPublished: false,
          tagIds: [otherTagId],
        })
        .expect(400);
    });

    it('tagIds를 교체하면 게시글의 tags가 변경된다', async () => {
      const tagId1 = await createTagAndGetId(token, 'first');
      const tagId2 = await createTagAndGetId(token, 'second');

      const createRes = await createPost(token, {
        title: 'Replace Tags',
        tagIds: [tagId1],
      }).expect(201);
      const postId = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Replace Tags',
          content: 'Default Content',
          isPublished: false,
          tagIds: [tagId2],
        })
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.tags).toHaveLength(1);
      expect(getRes.body.tags[0].name).toBe('second');
    });

    it('tagIds: []로 수정하면 게시글의 tags가 비워진다', async () => {
      const tagId1 = await createTagAndGetId(token, 'first');

      const createRes = await createPost(token, {
        title: 'Clear Tags',
        tagIds: [tagId1],
      }).expect(201);
      const postId = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Clear Tags',
          content: 'Default Content',
          isPublished: false,
          tagIds: [],
        })
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.tags).toEqual([]);
    });

    it('GET /posts?tagId=X는 해당 태그를 가진 게시글만 반환하고 각 게시글은 전체 태그를 보여준다', async () => {
      const tagId1 = await createTagAndGetId(token, 'target');
      const tagId2 = await createTagAndGetId(token, 'extra');

      await createPost(token, {
        title: 'Has Target',
        tagIds: [tagId1, tagId2],
      }).expect(201);
      await createPost(token, {
        title: 'No Target',
        tagIds: [tagId2],
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/posts?tagId=${tagId1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Has Target');
      expect(res.body.meta.totalElements).toBe(1);

      const names = (res.body.items[0].tags as Array<{ name: string }>)
        .map((t) => t.name)
        .sort();
      expect(names).toEqual(['extra', 'target']);
    });

    it('동일 page/limit으로 서로 다른 tagId를 연속 조회해도 캐시가 충돌하지 않는다', async () => {
      const tagIdA = await createTagAndGetId(token, 'alpha');
      const tagIdB = await createTagAndGetId(token, 'beta');

      await createPost(token, {
        title: 'Only Alpha',
        tagIds: [tagIdA],
      }).expect(201);
      await createPost(token, {
        title: 'Only Beta',
        tagIds: [tagIdB],
      }).expect(201);

      // tagId=A를 먼저 조회하여 캐시에 적재한다.
      const resA = await request(app.getHttpServer())
        .get(`/v1/posts?page=1&limit=10&tagId=${tagIdA}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(resA.body.items).toHaveLength(1);
      expect(resA.body.items[0].title).toBe('Only Alpha');

      // 같은 page/limit으로 tagId=B 조회 — 캐시 키에 tagId가 누락되면 A 결과가 반환된다.
      const resB = await request(app.getHttpServer())
        .get(`/v1/posts?page=1&limit=10&tagId=${tagIdB}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(resB.body.items).toHaveLength(1);
      expect(resB.body.items[0].title).toBe('Only Beta');

      // 필터 없는 조회는 두 게시글 모두 반환한다 (tagId='all' 키).
      const resAll = await request(app.getHttpServer())
        .get(`/v1/posts?page=1&limit=10`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(resAll.body.meta.totalElements).toBe(2);
    });

    it('태그를 삭제하면 해당 태그를 참조하던 게시글에서 제거된다 (FK CASCADE)', async () => {
      const tagId1 = await createTagAndGetId(token, 'to-delete');
      const tagId2 = await createTagAndGetId(token, 'to-keep');

      const createRes = await createPost(token, {
        title: 'Cascade Post',
        tagIds: [tagId1, tagId2],
      }).expect(201);
      const postId = createRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/v1/tags/${tagId1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.tags).toHaveLength(1);
      expect(getRes.body.tags[0].name).toBe('to-keep');
    });
  });
});
