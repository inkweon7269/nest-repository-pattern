export class GetTagByIdQuery {
  constructor(
    public readonly userId: number,
    public readonly id: number,
  ) {}
}
