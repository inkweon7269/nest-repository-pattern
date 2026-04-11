import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from '@src/admin/auth/admin-auth.controller';
import { AdminRegisterHandler } from '@src/admin/auth/command/admin-register.handler';
import { AdminLoginHandler } from '@src/admin/auth/command/admin-login.handler';
import { AdminRefreshTokenHandler } from '@src/admin/auth/command/admin-refresh-token.handler';
import { AdminLogoutHandler } from '@src/admin/auth/command/admin-logout.handler';
import { GetAdminProfileHandler } from '@src/admin/auth/query/get-admin-profile.handler';
import { adminRepositoryProviders } from '@src/admin/admin-repository.provider';
import { AdminJwtStrategy } from '@src/admin/strategy/admin-jwt.strategy';
import { AdminJwtAuthGuard } from '@src/admin/guard/admin-jwt-auth.guard';

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
