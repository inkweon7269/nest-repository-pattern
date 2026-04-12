import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';

export abstract class BaseRepository {
  constructor(private readonly dataSource: DataSource) {}

  private getEntityManager(entityManager?: EntityManager): EntityManager {
    return entityManager ?? this.dataSource.manager;
  }

  protected getRepository<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    entityManager?: EntityManager,
  ): Repository<T> {
    return this.getEntityManager(entityManager).getRepository(entity);
  }
}
