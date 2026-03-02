import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from '@src/auth/auth.controller';
import { RegisterHandler } from '@src/auth/command/register.handler';
import { LoginHandler } from '@src/auth/command/login.handler';
import { RefreshTokenHandler } from '@src/auth/command/refresh-token.handler';
import { userRepositoryProviders } from '@src/auth/user-repository.provider';
import { JwtStrategy } from '@src/auth/strategy/jwt.strategy';
import { JwtAuthGuard } from '@src/auth/guard/jwt-auth.guard';
import { GetProfileHandler } from '@src/auth/query/get-profile.handler';

const commandHandlers = [RegisterHandler, LoginHandler, RefreshTokenHandler];
const queryHandlers = [GetProfileHandler];

@Module({
  imports: [CqrsModule, PassportModule, JwtModule.register({})],
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
