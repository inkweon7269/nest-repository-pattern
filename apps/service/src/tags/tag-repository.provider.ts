import { Provider } from '@nestjs/common';
import { ITagReadRepository } from './interface/tag-read-repository.interface';
import { ITagWriteRepository } from './interface/tag-write-repository.interface';
import { TagRepository } from './tag.repository';

export const tagRepositoryProviders: Provider[] = [
  TagRepository,
  { provide: ITagReadRepository, useExisting: TagRepository },
  { provide: ITagWriteRepository, useExisting: TagRepository },
];
