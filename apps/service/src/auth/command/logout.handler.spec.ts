import { TestBed, type Mocked } from '@suites/unit';
import { NotFoundException } from '@nestjs/common';
import { LogoutHandler } from './logout.handler';
import { LogoutCommand } from './logout.command';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';

describe('LogoutHandler', () => {
  let handler: LogoutHandler;
  let userWriteRepository: Mocked<IUserWriteRepository>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(LogoutHandler).compile();

    handler = unit;
    userWriteRepository = unitRef.get(IUserWriteRepository);
  });

  it('정상 로그아웃 시 update가 올바른 인자로 호출된다', async () => {
    userWriteRepository.update.mockResolvedValue(1);

    const command = new LogoutCommand(1);
    await handler.execute(command);

    expect(userWriteRepository.update).toHaveBeenCalledWith(1, {
      hashedRefreshToken: null,
    });
  });

  it('존재하지 않는 사용자 ID (affected=0) → NotFoundException', async () => {
    userWriteRepository.update.mockResolvedValue(0);

    const command = new LogoutCommand(999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(userWriteRepository.update).toHaveBeenCalledWith(999, {
      hashedRefreshToken: null,
    });
  });
});
