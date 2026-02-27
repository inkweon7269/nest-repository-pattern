import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { DeletePostCommand } from '@src/posts/command/delete-post.command';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';

@CommandHandler(DeletePostCommand)
export class DeletePostHandler implements ICommandHandler<DeletePostCommand> {
  constructor(private readonly postWriteRepository: IPostWriteRepository) {}

  async execute(command: DeletePostCommand): Promise<void> {
    const affected = await this.postWriteRepository.delete(command.id);
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }
  }
}
