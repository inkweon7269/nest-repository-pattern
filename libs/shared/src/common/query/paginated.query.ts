export abstract class PaginatedQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
