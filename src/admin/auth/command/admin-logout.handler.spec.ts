import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminLogoutHandler } from '@src/admin/auth/command/admin-logout.handler';
import { AdminLogoutCommand } from '@src/admin/auth/command/admin-logout.command';
import { IAdminWriteRepository } from '@src/admin/interface/admin-write-repository.interface';

describe('AdminLogoutHandler', () => {
  let handler: AdminLogoutHandler;
  let mockWriteRepository: jest.Mocked<IAdminWriteRepository>;

  beforeEach(async () => {
    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminLogoutHandler,
        { provide: IAdminWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(AdminLogoutHandler);

    jest.clearAllMocks();
  });

  it('정상 로그아웃 시 update가 올바른 인자로 호출된다', async () => {
    mockWriteRepository.update.mockResolvedValue(1);

    const command = new AdminLogoutCommand(1);
    await handler.execute(command);

    expect(mockWriteRepository.update).toHaveBeenCalledWith(1, {
      hashedRefreshToken: null,
    });
  });

  it('존재하지 않는 관리자 ID (affected=0) → NotFoundException', async () => {
    mockWriteRepository.update.mockResolvedValue(0);

    const command = new AdminLogoutCommand(999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(mockWriteRepository.update).toHaveBeenCalledWith(999, {
      hashedRefreshToken: null,
    });
  });
});
