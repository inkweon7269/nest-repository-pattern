import { Post } from '@src/posts/entities/post.entity';

export interface CreatePostInput {
  title: string;
  content: string;
  isPublished?: boolean;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  isPublished?: boolean;
}

export abstract class IPostWriteRepository {
  abstract create(input: CreatePostInput): Promise<Post>;
  abstract update(id: number, input: UpdatePostInput): Promise<number>;
  abstract delete(id: number): Promise<number>;
}
