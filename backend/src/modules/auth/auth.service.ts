import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async staffLogin(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      kind: 'STAFF',
      role: user.role,
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId: user.id,
      staffId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ip,
      userAgent,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async providerLogin(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { email: email.toLowerCase() },
      include: { provider: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.dataProviderUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      kind: 'PROVIDER_USER',
      role: user.role,
      providerId: user.providerId,
    });

    await this.audit.log({
      actorType: 'PROVIDER_USER',
      actorId: user.id,
      action: 'LOGIN',
      entity: 'DataProviderUser',
      entityId: user.id,
      ip,
      userAgent,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        providerId: user.providerId,
        providerName: user.provider?.name,
      },
    };
  }

  async getStaffMe(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    const { passwordHash: _ph, ...rest } = user;
    return rest;
  }

  async getProviderMe(id: string) {
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id },
      include: { provider: true },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash: _ph, ...rest } = user;
    return rest;
  }

  async changeStaffPassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash: hash } });
    return { success: true };
  }

  async changeProviderPassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.dataProviderUser.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.dataProviderUser.update({ where: { id }, data: { passwordHash: hash } });
    return { success: true };
  }
}
