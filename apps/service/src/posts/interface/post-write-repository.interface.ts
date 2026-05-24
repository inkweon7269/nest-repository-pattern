import { Post } from '@app/shared';

export interface CreatePostInput {
  userId: number;
  title: string;
  content: string;
  isPublished?: boolean;
  tagIds?: number[];
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  isPublished?: boolean;
  tagIds?: number[];
}

export abstract class IPostWriteRepository {
  abstract create(input: CreatePostInput): Promise<Post>;
  abstract update(
    id: number,
    userId: number,
    input: UpdatePostInput,
  ): Promise<number>;
  abstract delete(id: number, userId: number): Promise<number>;
}
