import { TestBed } from '@suites/unit';
import { NotFoundException } from '@nestjs/common';
import { GetPostByIdHandler } from './get-post-by-id.handler';
import { GetPostByIdQuery } from './get-post-by-id.query';
import { IPostReadRepository } from '@service/posts/interface/post-read-repository.interface';
import { Post } from '@app/shared';
import { PostResponseDto } from '@service/posts/dto/response/post.response.dto';

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
    const { unit, unitRef } =
      await TestBed.solitary(GetPostByIdHandler).compile();

    handler = unit;
    mockReadRepository = unitRef.get(IPostReadRepository);
  });

  it('존재하는 본인의 게시글을 조회하면 PostResponseDto를 반환한다', async () => {
    mockReadRepository.findById.mockResolvedValue(mockPost);

    const query = new GetPostByIdQuery(1, 1);
    const result = await handler.execute(query);

    expect(result).toBeInstanceOf(PostResponseDto);
    expect(result.id).toBe(1);
    expect(result.userId).toBe(1);
    expect(result.title).toBe('Test Post');
    expect(result.content).toBe('Test Content');
  });

  it('존재하지 않는 게시글을 조회하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const query = new GetPostByIdQuery(1, 999);

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });

  it('다른 사용자의 게시글을 조회하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(mockPost);

    const query = new GetPostByIdQuery(2, 1);

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });
});
