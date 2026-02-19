import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreatePostCommand } from '@src/posts/command/create-post.command';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';

@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  constructor(private readonly postWriteRepository: IPostWriteRepository) {}

  async execute(command: CreatePostCommand): Promise<number> {
    const post = await this.postWriteRepository.create({
      title: command.title,
      content: command.content,
      isPublished: command.isPublished,
    });
    return post.id;
  }
}
