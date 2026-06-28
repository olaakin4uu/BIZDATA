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

  async validate(payload: { sub: string; kind: string; role?: string; providerId?: string }) {
    if (payload.kind !== 'PROVIDER_USER') {
      throw new UnauthorizedException('Not a provider token');
    }
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id: payload.sub },
      include: { provider: true },
    });
    if (!user) throw new UnauthorizedException('Provider user not found');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');
    return user;
  }
}
