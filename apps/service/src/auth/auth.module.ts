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
import { JwtStrategy } from './strategy/jwt.strategy';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { GetProfileHandler } from './query/get-profile.handler';
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
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
