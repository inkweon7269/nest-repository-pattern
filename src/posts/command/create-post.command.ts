export class CreatePostCommand {
  constructor(
    public readonly title: string,
    public readonly content: string,
    public readonly isPublished?: boolean,
  ) {}
}
