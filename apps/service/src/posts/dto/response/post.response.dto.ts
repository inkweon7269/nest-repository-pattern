import { ApiProperty } from '@nestjs/swagger';
import { Post } from '@app/shared';
import { TagResponseDto } from '@service/tags/dto/response/tag.response.dto';

export class PostResponseDto {
  @ApiProperty({ description: '게시글 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '작성자 ID', example: 1 })
  userId: number;

  @ApiProperty({ description: '게시글 제목', example: 'First Post' })
  title: string;

  @ApiProperty({ description: '게시글 내용', example: 'Hello World' })
  content: string;

  @ApiProperty({ description: '공개 여부', example: false })
  isPublished: boolean;

  @ApiProperty({ description: '생성일시' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시' })
  updatedAt: Date;

  @ApiProperty({ description: '연결된 태그 목록', type: [TagResponseDto] })
  tags: TagResponseDto[];

  static of(post: Post): PostResponseDto {
    const dto = new PostResponseDto();
    dto.id = post.id;
    dto.userId = post.userId;
    dto.title = post.title;
    dto.content = post.content;
    dto.isPublished = post.isPublished;
    dto.createdAt = post.createdAt;
    dto.updatedAt = post.updatedAt;
    dto.tags = (post.tags ?? []).map((tag) => TagResponseDto.of(tag));
    return dto;
  }
}
