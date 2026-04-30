import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { LoginCommand } from './login.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import { AuthTokens } from '@app/shared';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly tokenIssuer: AuthTokenIssuer,
  ) {}

  async execute(command: LoginCommand): Promise<AuthTokens> {
    const user = await this.userReadRepository.findByEmail(command.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      command.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.tokenIssuer.issueTokens(user);
  }
}
