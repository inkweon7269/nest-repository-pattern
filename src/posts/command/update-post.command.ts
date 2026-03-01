export class UpdatePostCommand {
  constructor(
    public readonly userId: number,
    public readonly id: number,
    public readonly title: string,
    public readonly content: string,
    public readonly isPublished: boolean,
  ) {}
}
