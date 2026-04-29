import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { GoogleAuthController } from './google-auth.controller';
import { RegisterHandler } from './command/register.handler';
import { LoginHandler } from './command/login.handler';
import { RefreshTokenHandler } from './command/refresh-token.handler';
import { LogoutHandler } from './command/logout.handler';
import { GoogleLoginHandler } from './command/google-login.handler';
import { LinkGoogleAccountHandler } from './command/link-google-account.handler';
import { UnlinkGoogleAccountHandler } from './command/unlink-google-account.handler';
import { userRepositoryProviders } from './user-repository.provider';
import { oauthAccountRepositoryProviders } from './oauth-account-repository.provider';
import { JwtStrategy } from './strategy/jwt.strategy';
import { GoogleStrategy } from './strategy/google.strategy';
import { GoogleLinkStrategy } from './strategy/google-link.strategy';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { GoogleLinkInitGuard } from './guard/google-link-init.guard';
import { GetProfileHandler } from './query/get-profile.handler';
import { AuthTokenIssuer } from './auth-token-issuer.service';
import { AppCacheModule } from '@app/shared';

const commandHandlers = [
  RegisterHandler,
  LoginHandler,
  RefreshTokenHandler,
  LogoutHandler,
  GoogleLoginHandler,
  LinkGoogleAccountHandler,
  UnlinkGoogleAccountHandler,
];
const queryHandlers = [GetProfileHandler];

@Module({
  imports: [CqrsModule, PassportModule, JwtModule.register({}), AppCacheModule],
  controllers: [AuthController, GoogleAuthController],
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
    GoogleLinkInitGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
