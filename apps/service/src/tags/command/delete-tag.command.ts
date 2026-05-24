export class DeleteTagCommand {
  constructor(
    public readonly userId: number,
    public readonly id: number,
  ) {}
}
