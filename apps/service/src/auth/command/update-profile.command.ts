export class UpdateProfileCommand {
  constructor(
    readonly userId: number,
    readonly name: string,
  ) {}
}
