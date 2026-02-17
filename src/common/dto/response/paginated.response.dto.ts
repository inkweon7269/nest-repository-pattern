import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ description: '현재 페이지 번호', example: 1 })
  page: number;

  @ApiProperty({ description: '페이지당 항목 수', example: 10 })
  limit: number;

  @ApiProperty({ description: '전체 항목 수', example: 100 })
  totalElements: number;

  @ApiProperty({ description: '전체 페이지 수', example: 10 })
  totalPages: number;

  @ApiProperty({ description: '첫 페이지 여부', example: true })
  isFirst: boolean;

  @ApiProperty({ description: '마지막 페이지 여부', example: false })
  isLast: boolean;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ description: '항목 목록', isArray: true })
  items: T[];

  @ApiProperty({ description: '페이지네이션 메타 정보', type: PaginationMeta })
  meta: PaginationMeta;

  static of<T>(
    items: T[],
    totalElements: number,
    page: number,
    limit: number,
  ): PaginatedResponseDto<T> {
    const dto = new PaginatedResponseDto<T>();
    const totalPages = Math.ceil(totalElements / limit);

    dto.items = items;
    dto.meta = {
      page,
      limit,
      totalElements,
      totalPages,
      isFirst: page === 1,
      isLast: page >= totalPages,
    };

    return dto;
  }
}
