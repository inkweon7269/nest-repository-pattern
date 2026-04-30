import { GoogleProfilePayload } from '@service/auth/strategy/google-profile.type';

export class LinkGoogleAccountCommand {
  constructor(
    public readonly userId: number,
    public readonly profile: GoogleProfilePayload,
  ) {}
}
