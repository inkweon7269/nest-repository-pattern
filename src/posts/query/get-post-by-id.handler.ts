import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetPostByIdQuery } from '@src/posts/query/get-post-by-id.query';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { PostResponseDto } from '@src/posts/dto/response/post.response.dto';

@QueryHandler(GetPostByIdQuery)
export class GetPostByIdHandler implements IQueryHandler<GetPostByIdQuery> {
  constructor(private readonly postReadRepository: IPostReadRepository) {}

  async execute(query: GetPostByIdQuery): Promise<PostResponseDto> {
    const post = await this.postReadRepository.findById(query.id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${query.id} not found`);
    }

    return PostResponseDto.of(post);
  }
}
