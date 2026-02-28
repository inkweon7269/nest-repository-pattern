import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeletePostCommand } from '@src/posts/command/delete-post.command';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';

@CommandHandler(DeletePostCommand)
export class DeletePostHandler implements ICommandHandler<DeletePostCommand> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
  ) {}

  async execute(command: DeletePostCommand): Promise<void> {
    const post = await this.postReadRepository.findById(command.id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }
    if (post.userId !== command.userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this post',
      );
    }

    const affected = await this.postWriteRepository.delete(
      command.id,
      command.userId,
    );
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }
  }
}
