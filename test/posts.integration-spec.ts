import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from './setup/integration-helper';

describe('Posts (integration)', () => {
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
    email: 'post-test@example.com',
    password: 'password123',
    name: '테스트유저',
  };

  async function registerAndLogin(body: Record<string, unknown> = {}) {
    const user = { ...defaultUser, ...body };
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(user)
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    return loginRes.body as { accessToken: string; refreshToken: string };
  }

  function createPost(token: string, body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Default Title', content: 'Default Content', ...body });
  }

  async function createAndGet(
    token: string,
    body: Record<string, unknown> = {},
  ) {
    const createRes = await createPost(token, body).expect(201);
    const id = createRes.body.id as number;
    const getRes = await request(app.getHttpServer())
      .get(`/posts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return getRes;
  }

  // ============================================================
  // 인증 없이 요청 시 401
  // ============================================================
  describe('Authentication required', () => {
    it('should return 401 for GET /posts without token', () => {
      return request(app.getHttpServer()).get('/posts').expect(401);
    });

    it('should return 401 for GET /posts/:id without token', () => {
      return request(app.getHttpServer()).get('/posts/1').expect(401);
    });

    it('should return 401 for POST /posts without token', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'Test', content: 'Content' })
        .expect(401);
    });

    it('should return 401 for PATCH /posts/:id without token', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ title: 'Test', content: 'Content', isPublished: false })
        .expect(401);
    });

    it('should return 401 for DELETE /posts/:id without token', () => {
      return request(app.getHttpServer()).delete('/posts/1').expect(401);
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

    it('should create a post and return { id }', async () => {
      const res = await createPost(token, {
        title: 'Integration Test',
        content: 'Real DB',
      }).expect(201);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('should persist the post to DB (verified via GET)', async () => {
      const getRes = await createAndGet(token, {
        title: 'Integration Test',
        content: 'Real DB',
      });

      expect(getRes.body.title).toBe('Integration Test');
      expect(getRes.body.content).toBe('Real DB');
      expect(getRes.body.isPublished).toBe(false);
    });

    it('should store userId of the authenticated user', async () => {
      const getRes = await createAndGet(token, {
        title: 'With Author',
        content: 'Content',
      });

      expect(getRes.body.userId).toBeDefined();
      expect(typeof getRes.body.userId).toBe('number');
    });

    it('should auto-generate id, createdAt, and updatedAt', async () => {
      const getRes = await createAndGet(token);

      expect(typeof getRes.body.id).toBe('number');
      expect(getRes.body.id).toBeGreaterThan(0);
      expect(getRes.body.createdAt).toBeDefined();
      expect(getRes.body.updatedAt).toBeDefined();
      expect(new Date(getRes.body.createdAt as string).getTime()).not.toBeNaN();
      expect(new Date(getRes.body.updatedAt as string).getTime()).not.toBeNaN();
    });

    it('should default isPublished to false when not provided', async () => {
      const getRes = await createAndGet(token, {
        title: 'No publish flag',
        content: 'Content',
      });

      expect(getRes.body.isPublished).toBe(false);
    });

    it('should create a post with isPublished: true', async () => {
      const getRes = await createAndGet(token, { isPublished: true });

      expect(getRes.body.isPublished).toBe(true);
    });

    it('should accept title at maximum column length (200 chars)', async () => {
      const maxTitle = 'A'.repeat(200);
      const getRes = await createAndGet(token, { title: maxTitle });

      expect(getRes.body.title).toBe(maxTitle);
    });

    it('should assign sequential ids for multiple creates', async () => {
      const res1 = await createPost(token, { title: 'First' }).expect(201);
      const res2 = await createPost(token, { title: 'Second' }).expect(201);

      expect(res2.body.id).toBeGreaterThan(res1.body.id as number);
    });

    it('should return 400 when title is missing', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'No title' })
        .expect(400);
    });

    it('should return 400 when content is missing', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'No content' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Post', content: 'Content', hacked: true })
        .expect(400);
    });

    it('should return 409 when same user creates a post with duplicate title', async () => {
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

    it('should allow different users to create posts with the same title', async () => {
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

    it('should return paginated response with default page=1, limit=10', async () => {
      await createPost(token, { title: 'Post A' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts')
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

    it('should return empty items when no posts exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta.totalElements).toBe(0);
      expect(res.body.meta.totalPages).toBe(0);
    });

    it('should paginate with custom page and limit', async () => {
      for (let i = 0; i < 5; i++) {
        await createPost(token, { title: `Post ${i + 1}` }).expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/posts?page=2&limit=2')
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

    it('should return items in id DESC order (newest first)', async () => {
      await createPost(token, { title: 'First' }).expect(201);
      await createPost(token, { title: 'Second' }).expect(201);
      await createPost(token, { title: 'Third' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts?limit=3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items[0].title).toBe('Third');
      expect(res.body.items[1].title).toBe('Second');
      expect(res.body.items[2].title).toBe('First');
    });

    it('should mark last page correctly', async () => {
      for (let i = 0; i < 3; i++) {
        await createPost(token, { title: `Post ${i + 1}` }).expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/posts?page=2&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.meta.isLast).toBe(true);
      expect(res.body.meta.isFirst).toBe(false);
    });

    it('should return correct response shape for items', async () => {
      await createPost(token).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts')
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

    it('should return 400 when page is 0', () => {
      return request(app.getHttpServer())
        .get('/posts?page=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should return 400 when limit exceeds 100', () => {
      return request(app.getHttpServer())
        .get('/posts?limit=101')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should return 400 when page is not a number', () => {
      return request(app.getHttpServer())
        .get('/posts?page=abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should filter by isPublished=true', async () => {
      await createPost(token, {
        title: 'Published',
        isPublished: true,
      }).expect(201);
      await createPost(token, {
        title: 'Draft',
        isPublished: false,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts?isPublished=true')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Published');
      expect(res.body.meta.totalElements).toBe(1);
    });

    it('should filter by isPublished=false', async () => {
      await createPost(token, {
        title: 'Published',
        isPublished: true,
      }).expect(201);
      await createPost(token, { title: 'Draft' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts?isPublished=false')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Draft');
      expect(res.body.meta.totalElements).toBe(1);
    });

    it('should combine isPublished filter with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await createPost(token, {
          title: `Published ${i}`,
          isPublished: true,
        }).expect(201);
      }
      await createPost(token, { title: 'Draft' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts?isPublished=true&limit=2&page=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.meta.totalElements).toBe(5);
      expect(res.body.meta.totalPages).toBe(3);
    });

    it('should return 400 for invalid isPublished value', () => {
      return request(app.getHttpServer())
        .get('/posts?isPublished=notabool')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
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

    it('should return a post by id', async () => {
      const createRes = await createPost(token, {
        title: 'Find Me',
        content: 'By ID',
      }).expect(201);

      const id = createRes.body.id as number;
      const res = await request(app.getHttpServer())
        .get(`/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.id).toBe(id);
      expect(res.body.title).toBe('Find Me');
      expect(res.body.content).toBe('By ID');
    });

    it('should return all entity fields correctly', async () => {
      const createRes = await createPost(token, {
        title: 'Full Fields',
        content: 'Check all',
        isPublished: true,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/posts/${createRes.body.id as number}`)
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

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .get('/posts/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer())
        .get('/posts/abc')
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

    it('should update all fields and return 204', async () => {
      const createRes = await createPost(token).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(fullUpdate)
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.title).toBe('Updated Title');
      expect(getRes.body.content).toBe('Updated Content');
      expect(getRes.body.isPublished).toBe(true);
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .patch('/posts/99999')
        .set('Authorization', `Bearer ${token}`)
        .send(fullUpdate)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it("should return 403 when updating another user's post", async () => {
      const createRes = await createPost(token).expect(201);
      const id = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      return request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .send(fullUpdate)
        .expect(403);
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer())
        .patch('/posts/abc')
        .set('Authorization', `Bearer ${token}`)
        .send(fullUpdate)
        .expect(400);
    });

    it('should return 400 for invalid body (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...fullUpdate, hacked: true })
        .expect(400);
    });

    it('should return 400 when required field is missing', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Only Title' })
        .expect(400);
    });

    it('should return 400 when title is empty string', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '', content: 'Content', isPublished: false })
        .expect(400);
    });

    it('should return 400 when content is empty string', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
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

    it('should delete a post and return 204', async () => {
      const createRes = await createPost(token).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .delete('/posts/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it("should return 403 when deleting another user's post", async () => {
      const createRes = await createPost(token).expect(201);
      const id = createRes.body.id as number;

      const tokens2 = await registerAndLogin({
        email: 'other@example.com',
        name: '다른유저',
      });

      return request(app.getHttpServer())
        .delete(`/posts/${id}`)
        .set('Authorization', `Bearer ${tokens2.accessToken}`)
        .expect(403);
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer())
        .delete('/posts/abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should allow creating a post with same title after soft-delete', async () => {
      const createRes = await createPost(token, {
        title: 'Reusable Title',
        content: 'Original',
      }).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .delete(`/posts/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const newRes = await createPost(token, {
        title: 'Reusable Title',
        content: 'Recreated',
      }).expect(201);

      expect(newRes.body.id).not.toBe(id);

      const getRes = await request(app.getHttpServer())
        .get(`/posts/${newRes.body.id as number}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.title).toBe('Reusable Title');
      expect(getRes.body.content).toBe('Recreated');
    });

    it('should not affect other posts', async () => {
      const res1 = await createPost(token, { title: 'Keep' }).expect(201);
      const res2 = await createPost(token, { title: 'Delete Me' }).expect(201);

      await request(app.getHttpServer())
        .delete(`/posts/${res2.body.id as number}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/posts/${res1.body.id as number}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.title).toBe('Keep');
    });
  });
});
