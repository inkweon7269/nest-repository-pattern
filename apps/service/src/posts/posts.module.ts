import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@service/auth/auth.module';
import { PostsController } from './posts.controller';
import { CreatePostHandler } from './command/create-post.handler';
import { UpdatePostHandler } from './command/update-post.handler';
import { DeletePostHandler } from './command/delete-post.handler';
import { PostCreatedHandler } from './event/post-created.handler';
import { GetPostByIdHandler } from './query/get-post-by-id.handler';
import { FindAllPostsPaginatedHandler } from './query/find-all-posts-paginated.handler';
import { postRepositoryProviders } from './post-repository.provider';
import { SlackModule } from '@app/shared';
import { AppCacheModule } from '@app/shared';

const commandHandlers = [
  CreatePostHandler,
  UpdatePostHandler,
  DeletePostHandler,
];

const queryHandlers = [GetPostByIdHandler, FindAllPostsPaginatedHandler];

const eventHandlers = [PostCreatedHandler];

@Module({
  imports: [CqrsModule, AuthModule, SlackModule, AppCacheModule],
  controllers: [PostsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    ...eventHandlers,
    ...postRepositoryProviders,
  ],
})
export class PostsModule {}
