import { Provider } from '@nestjs/common';
import { IPostReadRepository } from './post-read-repository.interface';
import { IPostWriteRepository } from './post-write-repository.interface';
import { PostRepository } from './post.repository';

export const postRepositoryProviders: Provider[] = [
  PostRepository,
  { provide: IPostReadRepository, useExisting: PostRepository },
  { provide: IPostWriteRepository, useExisting: PostRepository },
];
