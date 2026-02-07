import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsFacade } from './posts.facade';
import { PostsService } from './posts.service';
import { postRepositoryProvider } from './post-repository.provider';

@Module({
  controllers: [PostsController],
  providers: [PostsFacade, PostsService, postRepositoryProvider],
})
export class PostsModule {}
