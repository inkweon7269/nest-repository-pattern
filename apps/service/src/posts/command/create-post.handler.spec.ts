import { TestBed } from '@suites/unit';
import { ConflictException } from '@nestjs/common';
import { CreatePostHandler } from './create-post.handler';
import { CreatePostCommand } from './create-post.command';
import { IPostReadRepository } from '@service/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import { Post } from '@app/shared';

describe('CreatePostHandler', () => {
  let handler: CreatePostHandler;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(CreatePostHandler).compile();

    handler = unit;
    mockReadRepository = unitRef.get(IPostReadRepository);
    mockWriteRepository = unitRef.get(IPostWriteRepository);
  });

  it('중복되지 않는 제목이면 게시글을 생성하고 id를 반환한다', async () => {
    mockReadRepository.findByUserIdAndTitle.mockResolvedValue(null);
    mockWriteRepository.create.mockResolvedValue({ id: 1 } as Post);

    const command = new CreatePostCommand(1, 'New Title', 'Content', false);
    const result = await handler.execute(command);

    expect(result).toBe(1);
    expect(mockReadRepository.findByUserIdAndTitle).toHaveBeenCalledWith(
      1,
      'New Title',
    );
    expect(mockWriteRepository.create).toHaveBeenCalledWith({
      userId: 1,
      title: 'New Title',
      content: 'Content',
      isPublished: false,
    });
  });

  it('동일한 제목이 이미 존재하면 ConflictException을 발생시킨다', async () => {
    mockReadRepository.findByUserIdAndTitle.mockResolvedValue({
      id: 1,
    } as Post);

    const command = new CreatePostCommand(1, 'Duplicate Title', 'Content');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(mockWriteRepository.create).not.toHaveBeenCalled();
  });
});
