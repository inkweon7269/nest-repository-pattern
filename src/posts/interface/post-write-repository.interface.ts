import { Post } from '@src/posts/entities/post.entity';
import { CreatePostRequestDto } from '@src/posts/dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from '@src/posts/dto/request/update-post.request.dto';

export abstract class IPostWriteRepository {
  abstract create(dto: CreatePostRequestDto): Promise<Post>;
  abstract update(id: number, dto: UpdatePostRequestDto): Promise<Post | null>;
  abstract delete(id: number): Promise<void>;
}
