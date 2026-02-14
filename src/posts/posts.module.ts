import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsFacade } from './posts.facade';
import { PostsService } from './posts.service';
import { PostsValidationService } from './posts-validation.service';
import { postRepositoryProviders } from './post-repository.provider';

@Module({
  controllers: [PostsController],
  providers: [
    PostsFacade,
    PostsService,
    PostsValidationService,
    ...postRepositoryProviders,
  ],
})
export class PostsModule {}
