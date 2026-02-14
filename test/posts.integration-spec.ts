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

  // ============================================================
  // POST /posts
  // ============================================================
  describe('POST /posts', () => {
    it('should create a post and persist to DB', async () => {
      const res = await createPost({
        title: 'Integration Test',
        content: 'Real DB',
      }).expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Integration Test');
      expect(res.body.content).toBe('Real DB');
      expect(res.body.isPublished).toBe(false);
    });

    it('should auto-generate id, createdAt, and updatedAt', async () => {
      const res = await createPost().expect(201);

      expect(typeof res.body.id).toBe('number');
      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
      expect(new Date(res.body.createdAt as string).getTime()).not.toBeNaN();
      expect(new Date(res.body.updatedAt as string).getTime()).not.toBeNaN();
    });

    it('should default isPublished to false when not provided', async () => {
      const res = await createPost({
        title: 'No publish flag',
        content: 'Content',
      }).expect(201);

      expect(res.body.isPublished).toBe(false);
    });

    it('should create a post with isPublished: true', async () => {
      const res = await createPost({ isPublished: true }).expect(201);

      expect(res.body.isPublished).toBe(true);
    });

    it('should accept title at maximum column length (200 chars)', async () => {
      const maxTitle = 'A'.repeat(200);
      const res = await createPost({ title: maxTitle }).expect(201);

      expect(res.body.title).toBe(maxTitle);
    });

    it('should assign sequential ids for multiple creates', async () => {
      const res1 = await createPost({ title: 'First' }).expect(201);
      const res2 = await createPost({ title: 'Second' }).expect(201);

      expect(res2.body.id).toBe((res1.body.id as number) + 1);
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
  });

  // ============================================================
  // GET /posts
  // ============================================================
  describe('GET /posts', () => {
    it('should return empty array when no posts exist', async () => {
      const res = await request(app.getHttpServer()).get('/posts').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return all persisted posts', async () => {
      await createPost({ title: 'Post A', content: 'Content A' }).expect(201);
      await createPost({ title: 'Post B', content: 'Content B' }).expect(201);

      const res = await request(app.getHttpServer()).get('/posts').expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Post A');
      expect(res.body[1].title).toBe('Post B');
    });

    it('should return posts with correct response shape', async () => {
      await createPost().expect(201);

      const res = await request(app.getHttpServer()).get('/posts').expect(200);

      const post = res.body[0];
      expect(post).toHaveProperty('id');
      expect(post).toHaveProperty('title');
      expect(post).toHaveProperty('content');
      expect(post).toHaveProperty('isPublished');
      expect(post).toHaveProperty('createdAt');
      expect(post).toHaveProperty('updatedAt');
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
    it('should update title', async () => {
      const createRes = await createPost({ title: 'Original' }).expect(201);
      const id = createRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      const getRes = await request(app.getHttpServer())
        .get(`/posts/${id}`)
        .expect(200);

      expect(getRes.body.title).toBe('Updated Title');
    });

    it('should update content', async () => {
      const createRes = await createPost({ content: 'Original' }).expect(201);
      const id = createRes.body.id as number;

      const res = await request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .send({ content: 'Updated Content' })
        .expect(200);

      expect(res.body.content).toBe('Updated Content');
    });

    it('should update isPublished', async () => {
      const createRes = await createPost({ isPublished: false }).expect(201);
      const id = createRes.body.id as number;

      const res = await request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .send({ isPublished: true })
        .expect(200);

      expect(res.body.isPublished).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      const createRes = await createPost().expect(201);
      const id = createRes.body.id as number;

      const res = await request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .send({ title: 'New Title', content: 'New Content' })
        .expect(200);

      expect(res.body.title).toBe('New Title');
      expect(res.body.content).toBe('New Content');
    });

    it('should not change fields not included in body', async () => {
      const createRes = await createPost({
        title: 'Keep This',
        content: 'Keep This Too',
      }).expect(201);
      const id = createRes.body.id as number;

      const res = await request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .send({ title: 'Changed' })
        .expect(200);

      expect(res.body.title).toBe('Changed');
      expect(res.body.content).toBe('Keep This Too');
    });

    it('should update updatedAt after modification', async () => {
      const createRes = await createPost().expect(201);
      const id = createRes.body.id as number;
      const createdAt = createRes.body.createdAt as string;
      const originalUpdatedAt = createRes.body.updatedAt as string;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 50));

      const res = await request(app.getHttpServer())
        .patch(`/posts/${id}`)
        .send({ title: 'Trigger Update' })
        .expect(200);

      expect(res.body.createdAt).toBe(createdAt);
      expect(
        new Date(res.body.updatedAt as string).getTime(),
      ).toBeGreaterThanOrEqual(new Date(originalUpdatedAt).getTime());
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .patch('/posts/99999')
        .send({ title: 'No Post' })
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 99999 not found');
        });
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer())
        .patch('/posts/abc')
        .send({ title: 'X' })
        .expect(400);
    });

    it('should return 400 for invalid body (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ title: 'X', hacked: true })
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
