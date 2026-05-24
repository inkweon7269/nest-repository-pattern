import { BadRequestException, Injectable } from '@nestjs/common';
import { ITagReadRepository } from './interface/tag-read-repository.interface';

/**
 * 게시글에 연결하려는 태그가 모두 해당 사용자의 소유인지 검증하는 도메인 서비스.
 * Create/Update Post 핸들러가 공유한다.
 */
@Injectable()
export class TagOwnershipValidator {
  constructor(private readonly tagReadRepository: ITagReadRepository) {}

  async validateOwnedByUser(userId: number, tagIds?: number[]): Promise<void> {
    if (!tagIds?.length) {
      return;
    }

    const uniqueIds = [...new Set(tagIds)];
    const tags = await this.tagReadRepository.findByIdsAndUserId(
      uniqueIds,
      userId,
    );
    if (tags.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more tags do not exist or are not owned by the user',
      );
    }
  }
}
