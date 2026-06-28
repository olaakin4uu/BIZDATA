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

  async validate(payload: { sub: string; kind: string; role?: string }) {
    if (payload.kind !== 'STAFF') {
      throw new UnauthorizedException('Not a staff token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');
    return user;
  }
}
