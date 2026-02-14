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
      const res = await request(app.getHttpServer())
        .get('/posts')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return all persisted posts', async () => {
      await createPost({ title: 'Post A', content: 'Content A' }).expect(201);
      await createPost({ title: 'Post B', content: 'Content B' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Post A');
      expect(res.body[1].title).toBe('Post B');
    });

    it('should return posts with correct response shape', async () => {
      await createPost().expect(201);

      const res = await request(app.getHttpServer())
        .get('/posts')
        .expect(200);

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
});
