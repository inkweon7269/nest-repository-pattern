import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from './admin-auth.controller';
import { AdminRegisterHandler } from './command/admin-register.handler';
import { AdminLoginHandler } from './command/admin-login.handler';
import { AdminRefreshTokenHandler } from './command/admin-refresh-token.handler';
import { AdminLogoutHandler } from './command/admin-logout.handler';
import { GetAdminProfileHandler } from './query/get-admin-profile.handler';
import { adminRepositoryProviders } from './admin-repository.provider';
import { AdminJwtStrategy } from './strategy/admin-jwt.strategy';
import { AdminJwtAuthGuard } from './guard/admin-jwt-auth.guard';

const commandHandlers = [
  AdminRegisterHandler,
  AdminLoginHandler,
  AdminRefreshTokenHandler,
  AdminLogoutHandler,
];

const queryHandlers = [GetAdminProfileHandler];

@Module({
  imports: [CqrsModule, PassportModule, JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    ...adminRepositoryProviders,
    AdminJwtStrategy,
    AdminJwtAuthGuard,
  ],
  exports: [AdminJwtAuthGuard],
})
export class AdminModule {}
