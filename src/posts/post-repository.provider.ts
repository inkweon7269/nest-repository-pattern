import { Provider } from '@nestjs/common';
import { IPostRepository } from './post-repository.interface';
import { PostRepository } from './post.repository';

export const postRepositoryProvider: Provider = {
  provide: IPostRepository,
  useClass: PostRepository,
};
