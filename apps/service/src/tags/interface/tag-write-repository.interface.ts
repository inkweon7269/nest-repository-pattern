import { Tag } from '@app/shared';

export interface CreateTagInput {
  userId: number;
  name: string;
}

export interface UpdateTagInput {
  name?: string;
}

export abstract class ITagWriteRepository {
  abstract create(input: CreateTagInput): Promise<Tag>;
  abstract update(
    id: number,
    userId: number,
    input: UpdateTagInput,
  ): Promise<number>;
  abstract delete(id: number, userId: number): Promise<number>;
}
