export class UpdateTagCommand {
  constructor(
    public readonly userId: number,
    public readonly id: number,
    public readonly name: string,
  ) {}
}
