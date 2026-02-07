import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { postRepositoryProvider } from './post-repository.provider';

@Module({
  controllers: [PostsController],
  providers: [PostsService, postRepositoryProvider],
})
export class PostsModule {}
