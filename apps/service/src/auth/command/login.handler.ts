import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { LoginCommand } from './login.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import { AuthTokens, User } from '@app/shared';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly tokenIssuer: AuthTokenIssuer,
  ) {}

  async execute(command: LoginCommand): Promise<AuthTokens> {
    const user = await this.loadUserByEmail(command.email);
    await this.validatePasswordMatches(command.password, user.password);
    return this.tokenIssuer.issueTokens(user);
  }

  private async loadUserByEmail(email: string): Promise<User> {
    const user = await this.userReadRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }

  private async validatePasswordMatches(
    raw: string,
    hashed: string,
  ): Promise<void> {
    const isPasswordValid = await bcrypt.compare(raw, hashed);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }
  }
}
