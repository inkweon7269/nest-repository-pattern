import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { NotFoundException } from '@nestjs/common';
import { UnlinkGoogleAccountHandler } from './unlink-google-account.handler';
import { UnlinkGoogleAccountCommand } from './unlink-google-account.command';
import { IOAuthAccountWriteRepository } from '@service/auth/interface/oauth-account-write-repository.interface';

describe('UnlinkGoogleAccountHandler', () => {
  let handler: UnlinkGoogleAccountHandler;
  let oauthWriteRepository: Mocked<IOAuthAccountWriteRepository>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } = await TestBed.solitary(
      UnlinkGoogleAccountHandler,
    ).compile();

    handler = unit;
    oauthWriteRepository = unitRef.get<IOAuthAccountWriteRepository>(
      IOAuthAccountWriteRepository as Type<IOAuthAccountWriteRepository>,
    );
  });

  it('연결된 OAuthAccount가 있으면 정상 삭제한다', async () => {
    oauthWriteRepository.delete.mockResolvedValue(1);

    await handler.execute(new UnlinkGoogleAccountCommand(7));

    expect(oauthWriteRepository.delete).toHaveBeenCalledWith(7, 'google');
  });

  it('연결된 OAuthAccount가 없으면(affected=0) NotFoundException을 발생시킨다', async () => {
    oauthWriteRepository.delete.mockResolvedValue(0);

    await expect(
      handler.execute(new UnlinkGoogleAccountCommand(7)),
    ).rejects.toThrow(NotFoundException);
  });
});
