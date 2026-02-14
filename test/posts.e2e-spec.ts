import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PostsModule } from '../src/posts/posts.module';
import { IPostReadRepository } from '../src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '../src/posts/interface/post-write-repository.interface';
import { PostRepository } from '../src/posts/post.repository';
import { Post } from '../src/posts/entities/post.entity';

describe('Posts (e2e)', () => {
  let app: INestApplication<App>;

  const now = new Date();

  const mockPosts: Post[] = [
    {
      id: 1,
      title: 'First Post',
      content: 'Hello World',
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      title: 'Second Post',
      content: 'Goodbye World',
      isPublished: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const mockRepository: Partial<IPostReadRepository & IPostWriteRepository> = {
    findAll: jest.fn().mockResolvedValue(mockPosts),
    findById: jest.fn().mockImplementation((id: number) => {
      const post = mockPosts.find((p) => p.id === id) ?? null;
      return Promise.resolve(post);
    }),
    create: jest.fn().mockImplementation((dto) => {
      const post: Post = {
        id: 3,
        title: dto.title,
        content: dto.content,
        isPublished: dto.isPublished ?? false,
        createdAt: now,
        updatedAt: now,
      };
      return Promise.resolve(post);
    }),
    update: jest.fn().mockImplementation((id: number, dto) => {
      const post = mockPosts.find((p) => p.id === id);
      if (!post) return Promise.resolve(null);
      const defined = Object.fromEntries(
        Object.entries(dto as Record<string, unknown>).filter(
          ([, v]) => v !== undefined,
        ),
      );
      return Promise.resolve({ ...post, ...defined, updatedAt: now });
    }),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PostsModule],
    })
      .overrideProvider(PostRepository)
      .useValue(mockRepository)
      .overrideProvider(IPostReadRepository)
      .useValue(mockRepository)
      .overrideProvider(IPostWriteRepository)
      .useValue(mockRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /posts', () => {
    it('should return all posts', () => {
      return request(app.getHttpServer())
        .get('/posts')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(2);
          expect(res.body[0].id).toBe(1);
          expect(res.body[0].title).toBe('First Post');
          expect(res.body[1].id).toBe(2);
          expect(res.body[1].isPublished).toBe(true);
        });
    });
  });

  describe('GET /posts/:id', () => {
    it('should return a single post', () => {
      return request(app.getHttpServer())
        .get('/posts/1')
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(1);
          expect(res.body.title).toBe('First Post');
          expect(res.body.content).toBe('Hello World');
          expect(res.body.isPublished).toBe(false);
        });
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .get('/posts/999')
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 999 not found');
        });
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer()).get('/posts/abc').expect(400);
    });
  });

  describe('POST /posts', () => {
    it('should create a post with valid body', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'New Post', content: 'New Content' })
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBe(3);
          expect(res.body.title).toBe('New Post');
          expect(res.body.content).toBe('New Content');
          expect(res.body.isPublished).toBe(false);
        });
    });

    it('should create a post with isPublished: true', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'Published', content: 'Content', isPublished: true })
        .expect(201)
        .expect((res) => {
          expect(res.body.isPublished).toBe(true);
        });
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

    it('should strip unknown properties (whitelist)', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ title: 'Post', content: 'Content', hacked: true })
        .expect(400);
    });
  });

  describe('PATCH /posts/:id', () => {
    it('should update a post with valid body', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ title: 'Updated Title' })
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(1);
          expect(res.body.title).toBe('Updated Title');
          expect(res.body.content).toBe('Hello World');
        });
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .patch('/posts/999')
        .send({ title: 'Updated' })
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 999 not found');
        });
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer())
        .patch('/posts/abc')
        .send({ title: 'Updated' })
        .expect(400);
    });

    it('should return 400 for invalid body', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ title: 123 })
        .expect(400);
    });

    it('should strip unknown properties (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .patch('/posts/1')
        .send({ title: 'Updated', hacked: true })
        .expect(400);
    });
  });

  describe('DELETE /posts/:id', () => {
    it('should delete a post', () => {
      return request(app.getHttpServer())
        .delete('/posts/1')
        .expect(204)
        .expect((res) => {
          expect(res.body).toEqual({});
        });
    });

    it('should return 404 when post not found', () => {
      return request(app.getHttpServer())
        .delete('/posts/999')
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toBe('Post with ID 999 not found');
        });
    });

    it('should return 400 for non-numeric id', () => {
      return request(app.getHttpServer()).delete('/posts/abc').expect(400);
    });
  });
});
