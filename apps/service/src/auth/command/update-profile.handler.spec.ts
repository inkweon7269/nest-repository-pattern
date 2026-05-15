import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { NotFoundException } from '@nestjs/common';
import { UpdateProfileHandler } from './update-profile.handler';
import { UpdateProfileCommand } from './update-profile.command';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';
import { CacheService } from '@app/shared';

describe('UpdateProfileHandler', () => {
  let handler: UpdateProfileHandler;
  let userWriteRepository: Mocked<IUserWriteRepository>;
  let cacheService: Mocked<CacheService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(UpdateProfileHandler).compile();

    handler = unit;
    userWriteRepository = unitRef.get<IUserWriteRepository>(
      IUserWriteRepository as Type<IUserWriteRepository>,
    );
    cacheService = unitRef.get(CacheService);
  });

  it('name을 정상 수정하면 void를 반환하고 프로필 캐시를 무효화한다', async () => {
    userWriteRepository.update.mockResolvedValue(1);
    cacheService.del.mockResolvedValue(undefined);

    const command = new UpdateProfileCommand(1, '새이름');
    await expect(handler.execute(command)).resolves.toBeUndefined();

    expect(userWriteRepository.update).toHaveBeenCalledWith(1, {
      name: '새이름',
    });
    expect(cacheService.del).toHaveBeenCalledWith('profile:1');
  });

  it('affected가 0이면 NotFoundException을 던진다', async () => {
    userWriteRepository.update.mockResolvedValue(0);

    const command = new UpdateProfileCommand(999, '새이름');
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
