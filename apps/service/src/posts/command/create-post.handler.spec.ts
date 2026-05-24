import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CreatePostHandler } from './create-post.handler';
import { CreatePostCommand } from './create-post.command';
import { IPostReadRepository } from '@service/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import { TagOwnershipValidator } from '@service/tags/tag-ownership.validator';
import { Post } from '@app/shared';

describe('CreatePostHandler', () => {
  let handler: CreatePostHandler;
  let postReadRepository: Mocked<IPostReadRepository>;
  let postWriteRepository: Mocked<IPostWriteRepository>;
  let tagOwnershipValidator: Mocked<TagOwnershipValidator>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(CreatePostHandler).compile();

    handler = unit;
    postReadRepository = unitRef.get<IPostReadRepository>(
      IPostReadRepository as Type<IPostReadRepository>,
    );
    postWriteRepository = unitRef.get<IPostWriteRepository>(
      IPostWriteRepository as Type<IPostWriteRepository>,
    );
    tagOwnershipValidator = unitRef.get(TagOwnershipValidator);
  });

  it('중복되지 않는 제목이면 게시글을 생성하고 id를 반환한다', async () => {
    postReadRepository.findByUserIdAndTitle.mockResolvedValue(null);
    postWriteRepository.create.mockResolvedValue({ id: 1 } as Post);

    const command = new CreatePostCommand(1, 'New Title', 'Content', false);
    const result = await handler.execute(command);

    expect(result).toBe(1);
    expect(postReadRepository.findByUserIdAndTitle).toHaveBeenCalledWith(
      1,
      'New Title',
    );
    expect(postWriteRepository.create).toHaveBeenCalledWith({
      userId: 1,
      title: 'New Title',
      content: 'Content',
      isPublished: false,
      tagIds: undefined,
    });
  });

  it('동일한 제목이 이미 존재하면 ConflictException을 발생시킨다', async () => {
    postReadRepository.findByUserIdAndTitle.mockResolvedValue({
      id: 1,
    } as Post);

    const command = new CreatePostCommand(1, 'Duplicate Title', 'Content');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(postWriteRepository.create).not.toHaveBeenCalled();
  });

  it('소유한 태그가 모두 검증되면 tagIds와 함께 게시글을 생성한다', async () => {
    postReadRepository.findByUserIdAndTitle.mockResolvedValue(null);
    tagOwnershipValidator.validateOwnedByUser.mockResolvedValue(undefined);
    postWriteRepository.create.mockResolvedValue({ id: 10 } as Post);

    const command = new CreatePostCommand(
      1,
      'Tagged',
      'Content',
      false,
      [1, 2],
    );
    const result = await handler.execute(command);

    expect(result).toBe(10);
    expect(tagOwnershipValidator.validateOwnedByUser).toHaveBeenCalledWith(
      1,
      [1, 2],
    );
    expect(postWriteRepository.create).toHaveBeenCalledWith({
      userId: 1,
      title: 'Tagged',
      content: 'Content',
      isPublished: false,
      tagIds: [1, 2],
    });
  });

  it('요청한 태그 중 소유하지 않은 것이 있으면 BadRequestException을 발생시킨다', async () => {
    postReadRepository.findByUserIdAndTitle.mockResolvedValue(null);
    tagOwnershipValidator.validateOwnedByUser.mockRejectedValue(
      new BadRequestException(
        'One or more tags do not exist or are not owned by the user',
      ),
    );

    const command = new CreatePostCommand(
      1,
      'Tagged',
      'Content',
      false,
      [1, 2],
    );

    await expect(handler.execute(command)).rejects.toThrow(BadRequestException);
    expect(postWriteRepository.create).not.toHaveBeenCalled();
  });
});
