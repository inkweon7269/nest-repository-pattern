import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BaseRepository } from '@app/shared';
import {
  IPostReadRepository,
  PostFilter,
} from './interface/post-read-repository.interface';
import { IPostWriteRepository } from './interface/post-write-repository.interface';
import type {
  CreatePostInput,
  UpdatePostInput,
} from './interface/post-write-repository.interface';
import { Post } from '@app/shared';

@Injectable()
export class PostRepository
  extends BaseRepository
  implements IPostReadRepository, IPostWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get postRepository() {
    return this.getRepository(Post);
  }

  async findById(id: number): Promise<Post | null> {
    return this.postRepository.findOne({
      where: { id },
      relations: { tags: true },
    });
  }

  async findByUserIdAndTitle(
    userId: number,
    title: string,
  ): Promise<Post | null> {
    return this.postRepository.findOneBy({ userId, title });
  }

  async findAllPaginated(
    page: number,
    limit: number,
    filter: PostFilter = {},
  ): Promise<[Post[], number]> {
    const qb = this.postRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.tags', 'tag');

    if (filter.userId !== undefined) {
      qb.andWhere('post.userId = :userId', { userId: filter.userId });
    }

    if (filter.isPublished !== undefined) {
      qb.andWhere('post.isPublished = :isPublished', {
        isPublished: filter.isPublished,
      });
    }

    if (filter.tagId !== undefined) {
      qb.andWhere(
        (sub) => {
          const subQuery = sub
            .subQuery()
            .select('filterPost.id')
            .from(Post, 'filterPost')
            .innerJoin('filterPost.tags', 'filterTag')
            .where('filterTag.id = :tagId')
            .getQuery();
          return `post.id IN ${subQuery}`;
        },
        { tagId: filter.tagId },
      );
    }

    return qb
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('post.id', 'DESC')
      .getManyAndCount();
  }

  @Transactional()
  async create(input: CreatePostInput): Promise<Post> {
    const { tagIds, ...scalars } = input;
    const post = this.postRepository.create(scalars);
    const saved = await this.postRepository.save(post);

    const normalizedTagIds = tagIds ? [...new Set(tagIds)] : [];
    if (normalizedTagIds.length) {
      await this.postRepository
        .createQueryBuilder()
        .relation(Post, 'tags')
        .of(saved.id)
        .add(normalizedTagIds);
    }

    const reloaded = await this.postRepository.findOne({
      where: { id: saved.id },
      relations: { tags: true },
    });
    return reloaded ?? saved;
  }

  @Transactional()
  async update(
    id: number,
    userId: number,
    input: UpdatePostInput,
  ): Promise<number> {
    const { tagIds, ...scalars } = input;

    const affected = await this.updateScalars(id, userId, scalars);
    if (affected === 0 || tagIds === undefined) {
      return affected;
    }

    await this.replaceTags(id, userId, tagIds);
    return affected;
  }

  private async updateScalars(
    id: number,
    userId: number,
    scalars: Omit<UpdatePostInput, 'tagIds'>,
  ): Promise<number> {
    const criteria = { id, userId, deletedAt: IsNull() };

    if (Object.keys(scalars).length === 0) {
      const count = await this.postRepository.countBy(criteria);
      return count;
    }

    const result = await this.postRepository.update(criteria, scalars);
    return result.affected ?? 0;
  }

  private async replaceTags(
    id: number,
    userId: number,
    tagIds: number[],
  ): Promise<void> {
    const existing = await this.postRepository.findOne({
      where: { id, userId, deletedAt: IsNull() },
      relations: { tags: true },
    });
    if (!existing) {
      return;
    }

    const currentTagIds = (existing.tags ?? []).map((tag) => tag.id);
    const normalizedTagIds = [...new Set(tagIds)];
    await this.postRepository
      .createQueryBuilder()
      .relation(Post, 'tags')
      .of(id)
      .addAndRemove(normalizedTagIds, currentTagIds);
  }

  async delete(id: number, userId: number): Promise<number> {
    const result = await this.postRepository.softDelete({
      id,
      userId,
      deletedAt: IsNull(),
    });
    return result.affected ?? 0;
  }
}
