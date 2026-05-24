import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UpdatePostHandler } from './update-post.handler';
import { UpdatePostCommand } from './update-post.command';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import { TagOwnershipValidator } from '@service/tags/tag-ownership.validator';

// 단위 테스트는 실 DataSource를 부트스트랩하지 않으므로 `@Transactional()`을
// 트랜잭션 컨텍스트 초기화 없이 통과시키도록 no-op으로 치환한다. 트랜잭션 의미는
// 통합 테스트에서 검증한다.
jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

describe('UpdatePostHandler', () => {
  let handler: UpdatePostHandler;
  let postWriteRepository: Mocked<IPostWriteRepository>;
  let tagOwnershipValidator: Mocked<TagOwnershipValidator>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(UpdatePostHandler).compile();

    handler = unit;
    postWriteRepository = unitRef.get<IPostWriteRepository>(
      IPostWriteRepository as Type<IPostWriteRepository>,
    );
    tagOwnershipValidator = unitRef.get(TagOwnershipValidator);
  });

  it('존재하는 본인의 게시글을 수정하면 void를 반환한다', async () => {
    postWriteRepository.update.mockResolvedValue(1);

    const command = new UpdatePostCommand(
      1,
      1,
      'Updated Title',
      'Content',
      false,
    );
    const result = await handler.execute(command);

    expect(result).toBeUndefined();
    expect(postWriteRepository.update).toHaveBeenCalledWith(1, 1, {
      title: 'Updated Title',
      content: 'Content',
      isPublished: false,
      tagIds: undefined,
    });
  });

  it('소유한 태그가 검증되면 tagIds와 함께 수정한다', async () => {
    tagOwnershipValidator.validateOwnedByUser.mockResolvedValue(undefined);
    postWriteRepository.update.mockResolvedValue(1);

    const command = new UpdatePostCommand(
      1,
      1,
      'Updated Title',
      'Content',
      false,
      [1, 2],
    );
    await handler.execute(command);

    expect(tagOwnershipValidator.validateOwnedByUser).toHaveBeenCalledWith(
      1,
      [1, 2],
    );
    expect(postWriteRepository.update).toHaveBeenCalledWith(1, 1, {
      title: 'Updated Title',
      content: 'Content',
      isPublished: false,
      tagIds: [1, 2],
    });
  });

  it('요청한 태그 중 소유하지 않은 것이 있으면 BadRequestException을 발생시킨다', async () => {
    tagOwnershipValidator.validateOwnedByUser.mockRejectedValue(
      new BadRequestException(
        'One or more tags do not exist or are not owned by the user',
      ),
    );

    const command = new UpdatePostCommand(
      1,
      1,
      'Updated Title',
      'Content',
      false,
      [1, 2],
    );

    await expect(handler.execute(command)).rejects.toThrow(BadRequestException);
    expect(postWriteRepository.update).not.toHaveBeenCalled();
  });

  it('affected가 0이면 NotFoundException을 발생시킨다', async () => {
    postWriteRepository.update.mockResolvedValue(0);

    const command = new UpdatePostCommand(
      1,
      999,
      'Updated Title',
      'Content',
      false,
    );

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
