import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { RegisterHandler } from './register.handler';
import { RegisterCommand } from './register.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';
import { User } from '@app/shared';

jest.mock('bcrypt');

describe('RegisterHandler', () => {
  let handler: RegisterHandler;
  let userReadRepository: Mocked<IUserReadRepository>;
  let userWriteRepository: Mocked<IUserWriteRepository>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(RegisterHandler).compile();

    handler = unit;
    userReadRepository = unitRef.get<IUserReadRepository>(
      IUserReadRepository as Type<IUserReadRepository>,
    );
    userWriteRepository = unitRef.get<IUserWriteRepository>(
      IUserWriteRepository as Type<IUserWriteRepository>,
    );

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  it('중복되지 않는 이메일이면 사용자를 생성하고 id를 반환한다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(null);
    userWriteRepository.create.mockResolvedValue({ id: 1 } as User);

    const command = new RegisterCommand(
      'user@example.com',
      'password123',
      '홍길동',
      true,
    );
    const result = await handler.execute(command);

    expect(result).toBe(1);
    expect(userReadRepository.findByEmail).toHaveBeenCalledWith(
      'user@example.com',
    );
    expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    expect(userWriteRepository.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'hashed-password',
      name: '홍길동',
      marketingConsent: true,
    });
  });

  it('marketingConsent가 false면 create input에 false가 그대로 전달된다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(null);
    userWriteRepository.create.mockResolvedValue({ id: 1 } as User);

    const command = new RegisterCommand(
      'user@example.com',
      'password123',
      '홍길동',
      false,
    );
    await handler.execute(command);

    expect(userWriteRepository.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'hashed-password',
      name: '홍길동',
      marketingConsent: false,
    });
  });

  it('동일한 이메일이 이미 존재하면 ConflictException을 발생시킨다', async () => {
    userReadRepository.findByEmail.mockResolvedValue({ id: 1 } as User);

    const command = new RegisterCommand(
      'user@example.com',
      'password123',
      '홍길동',
      true,
    );

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(userWriteRepository.create).not.toHaveBeenCalled();
  });

  it('DB unique constraint 위반 시(23505) ConflictException을 발생시킨다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(null);

    const dbError = new QueryFailedError('INSERT', [], new Error());
    Object.assign(dbError, { driverError: { code: '23505' } });
    userWriteRepository.create.mockRejectedValue(dbError);

    const command = new RegisterCommand(
      'user@example.com',
      'password123',
      '홍길동',
      true,
    );

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
  });
});
