import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetPostByIdHandler } from '@src/posts/query/get-post-by-id.handler';
import { GetPostByIdQuery } from '@src/posts/query/get-post-by-id.query';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { Post } from '@src/posts/entities/post.entity';
import { PostResponseDto } from '@src/posts/dto/response/post.response.dto';

describe('GetPostByIdHandler', () => {
  let handler: GetPostByIdHandler;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;

  const now = new Date();
  const mockPost: Post = {
    id: 1,
    userId: 1,
    title: 'Test Post',
    content: 'Test Content',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  } as Post;

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findByUserIdAndTitle: jest.fn(),
      findAllPaginated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetPostByIdHandler,
        { provide: IPostReadRepository, useValue: mockReadRepository },
      ],
    }).compile();

    handler = module.get(GetPostByIdHandler);
  });

  it('존재하는 게시글을 조회하면 PostResponseDto를 반환한다', async () => {
    mockReadRepository.findById.mockResolvedValue(mockPost);

    const query = new GetPostByIdQuery(1);
    const result = await handler.execute(query);

    expect(result).toBeInstanceOf(PostResponseDto);
    expect(result.id).toBe(1);
    expect(result.userId).toBe(1);
    expect(result.title).toBe('Test Post');
    expect(result.content).toBe('Test Content');
  });

  it('존재하지 않는 게시글을 조회하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const query = new GetPostByIdQuery(999);

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });
});
