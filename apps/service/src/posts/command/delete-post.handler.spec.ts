import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DeletePostHandler } from './delete-post.handler';
import { DeletePostCommand } from './delete-post.command';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import { CacheService } from '@app/shared';

describe('DeletePostHandler', () => {
  let handler: DeletePostHandler;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletePostHandler,
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            delByPattern: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get(DeletePostHandler);
  });

  it('존재하는 본인의 게시글을 삭제하면 에러 없이 완료된다', async () => {
    mockWriteRepository.delete.mockResolvedValue(1);

    const command = new DeletePostCommand(1, 1);

    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(mockWriteRepository.delete).toHaveBeenCalledWith(1, 1);
  });

  it('affected가 0이면 NotFoundException을 발생시킨다', async () => {
    mockWriteRepository.delete.mockResolvedValue(0);

    const command = new DeletePostCommand(1, 999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
