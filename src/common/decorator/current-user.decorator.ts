import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '@src/common/decorator/auth-user.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
