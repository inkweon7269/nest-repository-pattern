import { Test, TestingModule } from '@nestjs/testing';
import { FindAllPostsPaginatedHandler } from '@src/posts/query/find-all-posts-paginated.handler';
import { FindAllPostsPaginatedQuery } from '@src/posts/query/find-all-posts-paginated.query';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { Post } from '@src/posts/entities/post.entity';
import { PostResponseDto } from '@src/posts/dto/response/post.response.dto';

describe('FindAllPostsPaginatedHandler', () => {
  let handler: FindAllPostsPaginatedHandler;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;

  const now = new Date();
  const mockPosts: Post[] = [
    {
      id: 2,
      title: 'Second Post',
      content: 'Content 2',
      isPublished: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 1,
      title: 'First Post',
      content: 'Content 1',
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findByTitle: jest.fn(),
      findAllPaginated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FindAllPostsPaginatedHandler,
        { provide: IPostReadRepository, useValue: mockReadRepository },
      ],
    }).compile();

    handler = module.get(FindAllPostsPaginatedHandler);
  });

  it('게시글 목록을 페이지네이션하여 PaginatedResponseDto로 반환한다', async () => {
    mockReadRepository.findAllPaginated.mockResolvedValue([mockPosts, 5]);

    const query = new FindAllPostsPaginatedQuery(1, 2);
    const result = await handler.execute(query);

    expect(mockReadRepository.findAllPaginated).toHaveBeenCalledWith(1, 2, {});
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeInstanceOf(PostResponseDto);
    expect(result.items[0].id).toBe(2);
    expect(result.items[1].id).toBe(1);
    expect(result.meta).toEqual({
      page: 1,
      limit: 2,
      totalElements: 5,
      totalPages: 3,
      isFirst: true,
      isLast: false,
    });
  });

  it('빈 목록이면 빈 items와 올바른 메타 정보를 반환한다', async () => {
    mockReadRepository.findAllPaginated.mockResolvedValue([[], 0]);

    const query = new FindAllPostsPaginatedQuery(1, 10);
    const result = await handler.execute(query);

    expect(result.items).toHaveLength(0);
    expect(result.meta.totalElements).toBe(0);
    expect(result.meta.totalPages).toBe(0);
    expect(result.meta.isFirst).toBe(true);
    expect(result.meta.isLast).toBe(true);
  });
});
