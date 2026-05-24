import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@service/auth/auth.module';
import { AppCacheModule } from '@app/shared';
import { TagsController } from './tags.controller';
import { CreateTagHandler } from './command/create-tag.handler';
import { UpdateTagHandler } from './command/update-tag.handler';
import { DeleteTagHandler } from './command/delete-tag.handler';
import { GetTagByIdHandler } from './query/get-tag-by-id.handler';
import { FindAllTagsPaginatedHandler } from './query/find-all-tags-paginated.handler';
import { tagRepositoryProviders } from './tag-repository.provider';
import { TagOwnershipValidator } from './tag-ownership.validator';

const commandHandlers = [CreateTagHandler, UpdateTagHandler, DeleteTagHandler];

const queryHandlers = [GetTagByIdHandler, FindAllTagsPaginatedHandler];

@Module({
  imports: [CqrsModule, AuthModule, AppCacheModule],
  controllers: [TagsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    ...tagRepositoryProviders,
    TagOwnershipValidator,
  ],
  exports: [TagOwnershipValidator],
})
export class TagsModule {}
