export class FindAllPostsPaginatedQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
