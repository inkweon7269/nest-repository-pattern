import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminRegisterHandler } from './admin-register.handler';
import { AdminRegisterCommand } from './admin-register.command';
import { IAdminReadRepository } from '@back-office/auth/interface/admin-read-repository.interface';
import { IAdminWriteRepository } from '@back-office/auth/interface/admin-write-repository.interface';
import { Admin, AdminRole } from '@app/shared';

jest.mock('bcrypt');

describe('AdminRegisterHandler', () => {
  let handler: AdminRegisterHandler;
  let adminReadRepository: Mocked<IAdminReadRepository>;
  let adminWriteRepository: Mocked<IAdminWriteRepository>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } =
      await TestBed.solitary(AdminRegisterHandler).compile();

    handler = unit;
    adminReadRepository = unitRef.get<IAdminReadRepository>(
      IAdminReadRepository as Type<IAdminReadRepository>,
    );
    adminWriteRepository = unitRef.get<IAdminWriteRepository>(
      IAdminWriteRepository as Type<IAdminWriteRepository>,
    );

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  it('중복되지 않는 이메일이면 관리자를 생성하고 id를 반환한다', async () => {
    adminReadRepository.findByEmail.mockResolvedValue(null);
    adminWriteRepository.create.mockResolvedValue({ id: 1 } as Admin);

    const command = new AdminRegisterCommand(
      'admin@example.com',
      'password123',
      '관리자',
      AdminRole.MANAGER,
    );
    const result = await handler.execute(command);

    expect(result).toBe(1);
    expect(adminReadRepository.findByEmail).toHaveBeenCalledWith(
      'admin@example.com',
    );
    expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    expect(adminWriteRepository.create).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'hashed-password',
      name: '관리자',
      role: AdminRole.MANAGER,
    });
  });

  it('role이 SUPER면 create input에 그대로 전달된다', async () => {
    adminReadRepository.findByEmail.mockResolvedValue(null);
    adminWriteRepository.create.mockResolvedValue({ id: 1 } as Admin);

    const command = new AdminRegisterCommand(
      'super@example.com',
      'password123',
      '슈퍼관리자',
      AdminRole.SUPER,
    );
    await handler.execute(command);

    expect(adminWriteRepository.create).toHaveBeenCalledWith({
      email: 'super@example.com',
      password: 'hashed-password',
      name: '슈퍼관리자',
      role: AdminRole.SUPER,
    });
  });

  it('동일한 이메일이 이미 존재하면 ConflictException을 발생시킨다', async () => {
    adminReadRepository.findByEmail.mockResolvedValue({ id: 1 } as Admin);

    const command = new AdminRegisterCommand(
      'admin@example.com',
      'password123',
      '관리자',
      AdminRole.MANAGER,
    );

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(adminWriteRepository.create).not.toHaveBeenCalled();
  });

  it('DB unique constraint 위반 시(23505) ConflictException을 발생시킨다', async () => {
    adminReadRepository.findByEmail.mockResolvedValue(null);

    const dbError = new QueryFailedError('INSERT', [], new Error());
    Object.assign(dbError, { driverError: { code: '23505' } });
    adminWriteRepository.create.mockRejectedValue(dbError);

    const command = new AdminRegisterCommand(
      'admin@example.com',
      'password123',
      '관리자',
      AdminRole.MANAGER,
    );

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
  });
});
