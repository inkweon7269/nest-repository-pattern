import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminRole } from '@src/admin/enum/admin-role.enum';

export interface AdminJwtPayload {
  sub: number;
  email: string;
  role: AdminRole;
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ADMIN_ACCESS_SECRET'),
    });
  }

  validate(payload: AdminJwtPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
