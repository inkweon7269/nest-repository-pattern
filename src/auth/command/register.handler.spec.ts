import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { RegisterHandler } from '@src/auth/command/register.handler';
import { RegisterCommand } from '@src/auth/command/register.command';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';
import { User } from '@src/auth/entities/user.entity';

jest.mock('bcrypt');

describe('RegisterHandler', () => {
  let handler: RegisterHandler;
  let mockReadRepository: jest.Mocked<IUserReadRepository>;
  let mockWriteRepository: jest.Mocked<IUserWriteRepository>;

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
    };

    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterHandler,
        { provide: IUserReadRepository, useValue: mockReadRepository },
        { provide: IUserWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(RegisterHandler);

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  it('중복되지 않는 이메일이면 사용자를 생성하고 id를 반환한다', async () => {
    mockReadRepository.findByEmail.mockResolvedValue(null);
    mockWriteRepository.create.mockResolvedValue({ id: 1 } as User);

    const command = new RegisterCommand(
      'user@example.com',
      'password123',
      '홍길동',
    );
    const result = await handler.execute(command);

    expect(result).toBe(1);
    expect(mockReadRepository.findByEmail).toHaveBeenCalledWith(
      'user@example.com',
    );
    expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    expect(mockWriteRepository.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'hashed-password',
      name: '홍길동',
    });
  });

  it('동일한 이메일이 이미 존재하면 ConflictException을 발생시킨다', async () => {
    mockReadRepository.findByEmail.mockResolvedValue({ id: 1 } as User);

    const command = new RegisterCommand(
      'user@example.com',
      'password123',
      '홍길동',
    );

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(mockWriteRepository.create).not.toHaveBeenCalled();
  });

  it('DB unique constraint 위반 시(23505) ConflictException을 발생시킨다', async () => {
    mockReadRepository.findByEmail.mockResolvedValue(null);

    const dbError = new QueryFailedError('INSERT', [], new Error());
    (dbError as QueryFailedError & { driverError: { code: string } }).driverError = {
      code: '23505',
    };
    mockWriteRepository.create.mockRejectedValue(dbError);

    const command = new RegisterCommand(
      'user@example.com',
      'password123',
      '홍길동',
    );

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
  });
});
