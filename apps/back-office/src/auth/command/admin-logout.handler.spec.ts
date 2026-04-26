import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { NotFoundException } from '@nestjs/common';
import { AdminLogoutHandler } from './admin-logout.handler';
import { AdminLogoutCommand } from './admin-logout.command';
import { IAdminWriteRepository } from '@back-office/auth/interface/admin-write-repository.interface';

describe('AdminLogoutHandler', () => {
  let handler: AdminLogoutHandler;
  let adminWriteRepository: Mocked<IAdminWriteRepository>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(AdminLogoutHandler).compile();

    handler = unit;
    adminWriteRepository = unitRef.get<IAdminWriteRepository>(
      IAdminWriteRepository as Type<IAdminWriteRepository>,
    );
  });

  it('정상 로그아웃 시 update가 올바른 인자로 호출된다', async () => {
    adminWriteRepository.update.mockResolvedValue(1);

    const command = new AdminLogoutCommand(1);
    await handler.execute(command);

    expect(adminWriteRepository.update).toHaveBeenCalledWith(1, {
      hashedRefreshToken: null,
    });
  });

  it('존재하지 않는 관리자 ID (affected=0) → NotFoundException', async () => {
    adminWriteRepository.update.mockResolvedValue(0);

    const command = new AdminLogoutCommand(999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(adminWriteRepository.update).toHaveBeenCalledWith(999, {
      hashedRefreshToken: null,
    });
  });
});
