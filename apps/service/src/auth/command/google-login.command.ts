import { GoogleProfilePayload } from '@service/auth/strategy/google-profile.type';

export class GoogleLoginCommand {
  constructor(public readonly profile: GoogleProfilePayload) {}
}
