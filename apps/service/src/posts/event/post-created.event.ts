export class PostCreatedEvent {
  constructor(
    public readonly postId: number,
    public readonly title: string,
    public readonly userId: number,
  ) {}
}
