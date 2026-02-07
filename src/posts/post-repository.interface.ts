import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from './dto/request/update-post.request.dto';

export abstract class IPostRepository {
  abstract findById(id: number): Promise<Post | null>;
  abstract findAll(): Promise<Post[]>;
  abstract create(dto: CreatePostRequestDto): Promise<Post>;
  abstract update(id: number, dto: UpdatePostRequestDto): Promise<Post | null>;
  abstract delete(id: number): Promise<void>;
}
