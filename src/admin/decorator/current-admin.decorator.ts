import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthAdmin } from '@src/admin/decorator/auth-admin.type';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthAdmin => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthAdmin }>();
    if (!request.user) {
      throw new UnauthorizedException('Authenticated admin not found');
    }
    return request.user;
  },
);
