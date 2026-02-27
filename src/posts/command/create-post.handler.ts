import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { QueryFailedError } from 'typeorm';
import { CreatePostCommand } from '@src/posts/command/create-post.command';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';

@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
  ) {}

  async execute(command: CreatePostCommand): Promise<number> {
    const existing = await this.postReadRepository.findByTitle(command.title);
    if (existing) {
      throw new ConflictException(
        `Post with title '${command.title}' already exists`,
      );
    }

    try {
      const post = await this.postWriteRepository.create({
        title: command.title,
        content: command.content,
        isPublished: command.isPublished,
      });
      return post.id;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException(
          `Post with title '${command.title}' already exists`,
        );
      }
      throw error;
    }
  }
}
