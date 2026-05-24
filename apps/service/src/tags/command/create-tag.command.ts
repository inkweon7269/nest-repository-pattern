export class CreateTagCommand {
  constructor(
    public readonly userId: number,
    public readonly name: string,
  ) {}
}
