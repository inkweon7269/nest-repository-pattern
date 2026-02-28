import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@src/auth/auth.module';
import { PostsController } from '@src/posts/posts.controller';
import { CreatePostHandler } from '@src/posts/command/create-post.handler';
import { UpdatePostHandler } from '@src/posts/command/update-post.handler';
import { DeletePostHandler } from '@src/posts/command/delete-post.handler';
import { GetPostByIdHandler } from '@src/posts/query/get-post-by-id.handler';
import { FindAllPostsPaginatedHandler } from '@src/posts/query/find-all-posts-paginated.handler';
import { postRepositoryProviders } from '@src/posts/post-repository.provider';

const commandHandlers = [
  CreatePostHandler,
  UpdatePostHandler,
  DeletePostHandler,
];

const queryHandlers = [GetPostByIdHandler, FindAllPostsPaginatedHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [PostsController],
  providers: [...commandHandlers, ...queryHandlers, ...postRepositoryProviders],
})
export class PostsModule {}
