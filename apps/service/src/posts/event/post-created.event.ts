export class PostCreatedEvent {
  static readonly event = 'post.created';

  constructor(
    public readonly postId: number,
    public readonly title: string,
    public readonly userId: number,
  ) {}
}
