import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class ProviderUsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(providerId: string, dto: any, actorId?: string) {
    if (!dto.email || !dto.password || !dto.firstName || !dto.lastName) {
      throw new BadRequestException('email, password, firstName, lastName required');
    }
    if (dto.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const provider = await this.prisma.dataProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    const existing = await this.prisma.dataProviderUser.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.dataProviderUser.create({
      data: {
        providerId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role || 'COMPLIANCE_OFFICER',
        isActive: dto.isActive !== false,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'CREATE_PROVIDER_USER',
      entity: 'DataProviderUser',
      entityId: user.id,
      afterJson: { email: user.email, providerId },
    });

    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async listByProvider(providerId: string) {
    const users = await this.prisma.dataProviderUser.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return users;
  }

  async findOne(id: string) {
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id },
      include: { provider: { select: { id: true, name: true, providerType: true } } },
    });
    if (!user) throw new NotFoundException('Provider user not found');
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: any, actorId?: string) {
    const before = await this.prisma.dataProviderUser.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Provider user not found');
    const user = await this.prisma.dataProviderUser.update({
      where: { id },
      data: {
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        phone: dto.phone ?? undefined,
        role: dto.role ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPDATE_PROVIDER_USER',
      entity: 'DataProviderUser',
      entityId: id,
    });
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async resetPassword(id: string, newPassword: string, actorId?: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.dataProviderUser.update({ where: { id }, data: { passwordHash } });
    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'RESET_PROVIDER_USER_PASSWORD',
      entity: 'DataProviderUser',
      entityId: id,
    });
    return { success: true };
  }
}
