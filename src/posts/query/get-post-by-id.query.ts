export class GetPostByIdQuery {
  constructor(
    public readonly userId: number,
    public readonly id: number,
  ) {}
}
