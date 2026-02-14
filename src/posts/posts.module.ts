import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsFacade } from './posts.facade';
import { PostsService } from './posts.service';
import { postRepositoryProviders } from './post-repository.provider';

@Module({
  controllers: [PostsController],
  providers: [PostsFacade, PostsService, ...postRepositoryProviders],
})
export class PostsModule {}
