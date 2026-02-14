import { Provider } from '@nestjs/common';
import { IPostReadRepository } from './interface/post-read-repository.interface';
import { IPostWriteRepository } from './interface/post-write-repository.interface';
import { PostRepository } from './post.repository';

export const postRepositoryProviders: Provider[] = [
  PostRepository,
  { provide: IPostReadRepository, useExisting: PostRepository },
  { provide: IPostWriteRepository, useExisting: PostRepository },
];
