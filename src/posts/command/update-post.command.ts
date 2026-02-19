export class UpdatePostCommand {
  constructor(
    public readonly id: number,
    public readonly title?: string,
    public readonly content?: string,
    public readonly isPublished?: boolean,
  ) {}
}
