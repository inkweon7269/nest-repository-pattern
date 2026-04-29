import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { RegisterHandler } from './command/register.handler';
import { LoginHandler } from './command/login.handler';
import { RefreshTokenHandler } from './command/refresh-token.handler';
import { LogoutHandler } from './command/logout.handler';
import { userRepositoryProviders } from './user-repository.provider';
import { oauthAccountRepositoryProviders } from './oauth-account-repository.provider';
import { JwtStrategy } from './strategy/jwt.strategy';
import { GoogleStrategy } from './strategy/google.strategy';
import { GoogleLinkStrategy } from './strategy/google-link.strategy';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { GetProfileHandler } from './query/get-profile.handler';
import { AuthTokenIssuer } from './auth-token-issuer.service';
import { AppCacheModule } from '@app/shared';

const commandHandlers = [
  RegisterHandler,
  LoginHandler,
  RefreshTokenHandler,
  LogoutHandler,
];
const queryHandlers = [GetProfileHandler];

@Module({
  imports: [CqrsModule, PassportModule, JwtModule.register({}), AppCacheModule],
  controllers: [AuthController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    ...userRepositoryProviders,
    ...oauthAccountRepositoryProviders,
    AuthTokenIssuer,
    JwtStrategy,
    GoogleStrategy,
    GoogleLinkStrategy,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
