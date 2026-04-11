import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetAdminProfileHandler } from './get-admin-profile.handler';
import { GetAdminProfileQuery } from './get-admin-profile.query';
import { IAdminReadRepository } from '../interface/admin-read-repository.interface';
import { Admin, AdminRole } from '@app/shared';
import { AdminProfileResponseDto } from '../dto/response/admin-profile.response.dto';

describe('GetAdminProfileHandler', () => {
  let handler: GetAdminProfileHandler;
  let mockReadRepository: jest.Mocked<IAdminReadRepository>;

  const now = new Date();
  const mockAdmin: Admin = {
    id: 1,
    email: 'admin@example.com',
    password: 'hashed-password',
    name: '관리자',
    role: AdminRole.MANAGER,
    hashedRefreshToken: 'hashed-token',
    createdAt: now,
    updatedAt: now,
  } as Admin;

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminProfileHandler,
        { provide: IAdminReadRepository, useValue: mockReadRepository },
      ],
    }).compile();

    handler = module.get(GetAdminProfileHandler);
  });

  it('존재하는 관리자의 프로필을 조회하면 AdminProfileResponseDto를 반환한다', async () => {
    mockReadRepository.findById.mockResolvedValue(mockAdmin);

    const query = new GetAdminProfileQuery(1);
    const result = await handler.execute(query);

    expect(result).toBeInstanceOf(AdminProfileResponseDto);
    expect(result.id).toBe(1);
    expect(result.email).toBe('admin@example.com');
    expect(result.name).toBe('관리자');
    expect(result.role).toBe(AdminRole.MANAGER);
  });

  it('존재하지 않는 관리자를 조회하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const query = new GetAdminProfileQuery(999);

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });
});
