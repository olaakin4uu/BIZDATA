import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtProviderStrategy extends PassportStrategy(Strategy, 'jwt-provider') {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'bizdata-dev-secret',
    });
  }

  async validate(payload: { sub: string; kind: string; role?: string; providerId?: string; pwdIat?: number }) {
    if (payload.kind !== 'PROVIDER_USER') {
      throw new UnauthorizedException('Not a provider token');
    }
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id: payload.sub },
      include: { provider: true },
    });
    if (!user) throw new UnauthorizedException('Provider user not found');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');
    // Session invalidation on password change (mirrors the staff strategy):
    // reject tokens minted before the current password epoch.
    if (user.passwordChangedAt) {
      if ((payload.pwdIat ?? 0) < user.passwordChangedAt.getTime()) {
        throw new UnauthorizedException('Session expired — please sign in again.');
      }
    }
    return user;
  }
}
