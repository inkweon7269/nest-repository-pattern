import { TestBed } from '@suites/unit';
import { NotFoundException } from '@nestjs/common';
import { GetProfileHandler } from './get-profile.handler';
import { GetProfileQuery } from './get-profile.query';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { User } from '@app/shared';
import { ProfileResponseDto } from '@service/auth/dto/response/profile.response.dto';

describe('GetProfileHandler', () => {
  let handler: GetProfileHandler;
  let mockReadRepository: jest.Mocked<IUserReadRepository>;

  const now = new Date();
  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    password: 'hashed-password',
    name: '테스트유저',
    hashedRefreshToken: 'hashed-token',
    createdAt: now,
    updatedAt: now,
  } as User;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(GetProfileHandler).compile();

    handler = unit;
    mockReadRepository = unitRef.get(IUserReadRepository);
  });

  it('존재하는 사용자의 프로필을 조회하면 ProfileResponseDto를 반환한다', async () => {
    mockReadRepository.findById.mockResolvedValue(mockUser);

    const query = new GetProfileQuery(1);
    const result = await handler.execute(query);

    expect(result).toBeInstanceOf(ProfileResponseDto);
    expect(result.id).toBe(1);
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBe('테스트유저');
  });

  it('존재하지 않는 사용자를 조회하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const query = new GetProfileQuery(999);

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });
});
