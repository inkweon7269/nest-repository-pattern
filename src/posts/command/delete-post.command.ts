export class DeletePostCommand {
  constructor(
    public readonly userId: number,
    public readonly id: number,
  ) {}
}
