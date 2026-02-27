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

  function createPost(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/posts')
      .send({ title: 'Default Title', content: 'Default Content', ...body });
  }

  /** POST로 생성 후 GET으로 조회하여 전체 응답을 반환 */
  async function createAndGet(body: Record<string, unknown> = {}) {
    const createRes = await createPost(body).expect(201);
    const id = createRes.body.id as number;
    const getRes = await request(app.getHttpServer())
      .get(`/posts/${id}`)
      .expect(200);
    return getRes;
  }

  // ============================================================
  // POST /posts
  // ============================================================
  describe('POST /posts', () => {
    it('should create a post and return { id }', async () => {
      const res = await createPost({
        title: 'Integration Test',
        content: 'Real DB',
      }).expect(201);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('should persist the post to DB (verified via GET)', async () => {
      const getRes = await createAndGet({
        title: 'Integration Test',
        content: 'Real DB',
      });

      expect(getRes.body.title).toBe('Integration Test');
      expect(getRes.body.content).toBe('Real DB');
      expect(getRes.body.isPublished).toBe(false);
    });

    it('should auto-generate id, createdAt, and updatedAt', async () => {
      const getRes = await createAndGet();

      expect(typeof getRes.body.id).toBe('number');
      expect(getRes.body.id).toBeGreaterThan(0);
      expect(getRes.body.createdAt).toBeDefined();
      expect(getRes.body.updatedAt).toBeDefined();
      expect(new Date(getRes.body.createdAt as string).getTime()).not.toBeNaN();
      expect(new Date(getRes.body.updatedAt as string).getTime()).not.toBeNaN();
    });

    it('should default isPublished to false when not provided', async () => {
      const getRes = await createAndGet({
        title: 'No publish flag',
        content: 'Content',
      });

      expect(getRes.body.isPublished).toBe(false);
    });

    it('should create a post with isPublished: true', async () => {
      const getRes = await createAndGet({ isPublished: true });

      expect(getRes.body.isPublished).toBe(true);
    });

    it('should accept title at maximum column length (200 chars)', async () => {
      const maxTitle = 'A'.repeat(200);
      const getRes = await createAndGet({ title: maxTitle });

      expect(getRes.body.title).toBe(maxTitle);
    });

    it('should assign sequential ids for multiple creates', async () => {
      const res1 = await createPost({ title: 'First' }).expect(201);
      const res2 = await createPost({ title: 'Second' }).expect(201);

      expect(res2.body.id).toBeGreaterThan(res1.body.id as number);
    });

    it('should return 400 when title is missing', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ content: 'No title' })
        .expect(400);
    });

    it('should return 400 when content is missing', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'No content' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer()).post('/posts').send({}).expect(400);
    });

    it('should return 400 for unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'Post', content: 'Content', hacked: true })
        .expect(400);
    });

    it('should return 409 when creating a post with duplicate title', async () => {
      await createPost({ title: 'Unique Title', content: 'First' }).expect(201);

      const res = await createPost({
        title: 'Unique Title',
        content: 'Second',
      }).expect(409);

      expect(res.body.message).toContain('Unique Title');
    });
  });

  // ============================================================
  // GET /posts (pagination)
  // ============================================================
  describe('GET /posts', () => {
    it('should return paginated response with default page=1, limit=10', async () => {
      await createPost({ title: 'Post A' }).expect(201);

      const res = await request(app.getHttpServer()).get('/posts').expect(200);

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
      const res = await request(app.getHttpServer()).get('/posts').expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.meta.totalElements).toBe(0);
      expect(res.body.meta.totalPages).toBe(0);
    });

    it('should paginate with custom page and limit', async () => {
      for (let i = 0; i < 5; i++) {
        await createPost({ title: `Post ${i + 1}` }).expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/posts?page=2&limit=2')
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
      await createPost({ title: 'First' }).expect(201);
      await createPost({ title: 'Second' }).expect(201);
      await createPost({ title: 'Third' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts?limit=3')
        .expect(200);

      expect(res.body.items[0].title).toBe('Third');
      expect(res.body.items[1].title).toBe('Second');
      expect(res.body.items[2].title).toBe('First');
    });

    it('should mark last page correctly', async () => {
      for (let i = 0; i < 3; i++) {
        await createPost({ title: `Post ${i + 1}` }).expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/posts?page=2&limit=2')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.meta.isLast).toBe(true);
      expect(res.body.meta.isFirst).toBe(false);
    });

    it('should return correct response shape for items', async () => {
      await createPost().expect(201);

      const res = await request(app.getHttpServer()).get('/posts').expect(200);

      const post = res.body.items[0];
      expect(post).toHaveProperty('id');
      expect(post).toHaveProperty('title');
      expect(post).toHaveProperty('content');
      expect(post).toHaveProperty('isPublished');
      expect(post).toHaveProperty('createdAt');
      expect(post).toHaveProperty('updatedAt');
    });

    it('should return 400 when page is 0', () => {
      return request(app.getHttpServer()).get('/posts?page=0').expect(400);
    });

    it('should return 400 when limit exceeds 100', () => {
      return request(app.getHttpServer()).get('/posts?limit=101').expect(400);
    });

    it('should return 400 when page is not a number', () => {
      return request(app.getHttpServer()).get('/posts?page=abc').expect(400);
    });

    it('should filter by isPublished=true', async () => {
      await createPost({ title: 'Published', isPublished: true }).expect(201);
      await createPost({ title: 'Draft', isPublished: false }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts?isPublished=true')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Published');
      expect(res.body.meta.totalElements).toBe(1);
    });

    it('should filter by isPublished=false', async () => {
      await createPost({ title: 'Published', isPublished: true }).expect(201);
      await createPost({ title: 'Draft' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts?isPublished=false')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Draft');
      expect(res.body.meta.totalElements).toBe(1);
    });

    it('should combine isPublished filter with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await createPost({
          title: `Published ${i}`,
          isPublished: true,
        }).expect(201);
      }
      await createPost({ title: 'Draft' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts?isPublished=true&limit=2&page=1')
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.meta.totalElements).toBe(5);
      expect(res.body.meta.totalPages).toBe(3);
    });

    it('should return 400 for invalid isPublished value', () => {
      return request(app.getHttpServer())
        .get('/posts?isPublished=notabool')
        .expect(400);
    });
  });

  // ============================================================
  // GET /posts/:id
  // ============================================================
  describe('GET /posts/:id', () => {
    it('should return a post by id', async () => {
      const createRes = await createPost({
        title: 'Find Me',
        content: 'By ID',
      }).expect(201);

      const id = createRes.body.id as number;
      const res = await request(app.getHttpServer())
        .get(`/posts/${id}`)
        .expect(200);

      expect(res.body.id).toBe(id);
      expect(res.body.title).toBe('Find Me');
      expect(res.body.content).toBe('By ID');
    });

    it('should return all entity fields correctly', async () => {
      const createRes = await createPost({
        title: 'Full Fields',
        content: 'Check all',
        isPublished: true,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/posts/${createRes.body.id as number}`)
        .expect(200);

      expect(res.body.title).toBe('Full Fields');
      expect(res.body.content).toBe('Check all');
      expect(res.body.isPublished).toBe(true);
      expect(typeof res.body.id).toBe('number');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .get('/posts/99999')
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer()).get('/posts/abc').expect(400);
    });
  });

  // ============================================================
  // PATCH /posts/:id
  // ============================================================
  describe('PATCH /posts/:id', () => {
    const fullUpdate = {
      title: 'Updated Title',
      content: 'Updated Content',
      isPublished: true,
    };

    it('should update all fields and return 204', async () => {
      const createRes = await createPost().expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .send(fullUpdate)
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/posts/${id}`)
        .expect(200);

      expect(getRes.body.title).toBe('Updated Title');
      expect(getRes.body.content).toBe('Updated Content');
      expect(getRes.body.isPublished).toBe(true);
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .patch('/posts/99999')
        .send(fullUpdate)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer())
        .patch('/posts/abc')
        .send(fullUpdate)
        .expect(400);
    });

    it('should return 400 for invalid body (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ ...fullUpdate, hacked: true })
        .expect(400);
    });

    it('should return 400 when required field is missing', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ title: 'Only Title' })
        .expect(400);
    });

    it('should return 400 when title is empty string', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ title: '', content: 'Content', isPublished: false })
        .expect(400);
    });

    it('should return 400 when content is empty string', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ title: 'Title', content: '', isPublished: false })
        .expect(400);
    });
  });

  // ============================================================
  // DELETE /posts/:id
  // ============================================================
  describe('DELETE /posts/:id', () => {
    it('should delete a post and return 204', async () => {
      const createRes = await createPost().expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer()).delete(`/posts/${id}`).expect(204);

      await request(app.getHttpServer()).get(`/posts/${id}`).expect(404);
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .delete('/posts/99999')
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer()).delete('/posts/abc').expect(400);
    });

    it('should not affect other posts', async () => {
      const res1 = await createPost({ title: 'Keep' }).expect(201);
      const res2 = await createPost({ title: 'Delete Me' }).expect(201);

      await request(app.getHttpServer())
        .delete(`/posts/${res2.body.id as number}`)
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get(`/posts/${res1.body.id as number}`)
        .expect(200);

      expect(getRes.body.title).toBe('Keep');
    });
  });
});
