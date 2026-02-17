import { Module } from '@nestjs/common';
import { PostsController } from '@src/posts/posts.controller';
import { PostsFacade } from '@src/posts/posts.facade';
import { PostsService } from '@src/posts/service/posts.service';
import { PostsValidationService } from '@src/posts/service/posts-validation.service';
import { postRepositoryProviders } from '@src/posts/post-repository.provider';

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
