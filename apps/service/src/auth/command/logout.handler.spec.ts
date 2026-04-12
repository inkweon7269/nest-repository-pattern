import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LogoutHandler } from './logout.handler';
import { LogoutCommand } from './logout.command';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';

describe('LogoutHandler', () => {
  let handler: LogoutHandler;
  let mockWriteRepository: jest.Mocked<IUserWriteRepository>;

  beforeEach(async () => {
    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogoutHandler,
        { provide: IUserWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(LogoutHandler);

    jest.clearAllMocks();
  });

  it('정상 로그아웃 시 update가 올바른 인자로 호출된다', async () => {
    mockWriteRepository.update.mockResolvedValue(1);

    const command = new LogoutCommand(1);
    await handler.execute(command);

    expect(mockWriteRepository.update).toHaveBeenCalledWith(1, {
      hashedRefreshToken: null,
    });
  });

  it('존재하지 않는 사용자 ID (affected=0) → NotFoundException', async () => {
    mockWriteRepository.update.mockResolvedValue(0);

    const command = new LogoutCommand(999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(mockWriteRepository.update).toHaveBeenCalledWith(999, {
      hashedRefreshToken: null,
    });
  });
});
