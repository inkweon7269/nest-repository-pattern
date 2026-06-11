import { ApiProperty } from '@nestjs/swagger';
import { Tag } from '@app/shared';

export class TagResponseDto {
  @ApiProperty({ description: '태그 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '소유자 ID', example: 1 })
  userId!: number;

  @ApiProperty({ description: '태그 이름', example: 'nestjs' })
  name!: string;

  @ApiProperty({ description: '생성일시' })
  createdAt!: Date;

  @ApiProperty({ description: '수정일시' })
  updatedAt!: Date;

  static of(tag: Tag): TagResponseDto {
    const dto = new TagResponseDto();
    dto.id = tag.id;
    dto.userId = tag.userId;
    dto.name = tag.name;
    dto.createdAt = tag.createdAt;
    dto.updatedAt = tag.updatedAt;
    return dto;
  }
}
