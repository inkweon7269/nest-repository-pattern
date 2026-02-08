import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createIntegrationApp, truncateAllTables } from './setup/integration-helper';

describe('Posts (integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createIntegrationApp();

    const dataSource = app.get(DataSource);
    await truncateAllTables(dataSource);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('POST /posts', () => {
    it('should create a post and persist to DB', async () => {
      const res = await request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'Integration Test', content: 'Real DB' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Integration Test');
      expect(res.body.content).toBe('Real DB');
      expect(res.body.isPublished).toBe(false);
      expect(res.body.createdAt).toBeDefined();
    });

    it('should create a post with isPublished: true', async () => {
      const res = await request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'Published', content: 'Content', isPublished: true })
        .expect(201);

      expect(res.body.isPublished).toBe(true);
    });

    it('should return 400 when title is missing', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ content: 'No title' })
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

  describe('GET /posts', () => {
    it('should return all persisted posts', async () => {
      const res = await request(app.getHttpServer())
        .get('/posts')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body[0].id).toBeDefined();
      expect(res.body[0].title).toBeDefined();
    });
  });

  describe('GET /posts/:id', () => {
    it('should return a post created earlier', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'Find Me', content: 'By ID' })
        .expect(201);

      const id = createRes.body.id;

      const res = await request(app.getHttpServer())
        .get(`/posts/${id}`)
        .expect(200);

      expect(res.body.id).toBe(id);
      expect(res.body.title).toBe('Find Me');
      expect(res.body.content).toBe('By ID');
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer()).get('/posts/99999').expect(404);
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer()).get('/posts/abc').expect(400);
    });
  });
});
