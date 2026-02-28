import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdatePostCommand } from '@src/posts/command/update-post.command';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';

@CommandHandler(UpdatePostCommand)
export class UpdatePostHandler implements ICommandHandler<UpdatePostCommand> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
  ) {}

  async execute(command: UpdatePostCommand): Promise<void> {
    const post = await this.postReadRepository.findById(command.id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }
    if (post.userId !== command.userId) {
      throw new ForbiddenException(
        'You do not have permission to update this post',
      );
    }

    const affected = await this.postWriteRepository.update(command.id, {
      title: command.title,
      content: command.content,
      isPublished: command.isPublished,
    });
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }
  }
}
