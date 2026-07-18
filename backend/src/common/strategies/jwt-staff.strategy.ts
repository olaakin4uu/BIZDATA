import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStaffStrategy extends PassportStrategy(Strategy, 'jwt-staff') {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'bizdata-dev-secret',
    });
  }

  async validate(payload: { sub: string; kind: string; role?: string; pwdIat?: number }) {
    if (payload.kind !== 'STAFF') {
      throw new UnauthorizedException('Not a staff token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');
    // Session invalidation on password change: reject tokens issued before the
    // current password epoch. `pwdIat` is epoch-milliseconds of the password
    // change the token was minted against; a later passwordChangedAt (even
    // sub-second) makes it strictly greater, evicting the token. A missing
    // pwdIat (token from before this feature) is treated as 0, so any recorded
    // passwordChangedAt evicts it too.
    if (user.passwordChangedAt) {
      if ((payload.pwdIat ?? 0) < user.passwordChangedAt.getTime()) {
        throw new UnauthorizedException('Session expired — please sign in again.');
      }
    }
    return user;
  }
}
