import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: any, actorId?: string) {
    if (!dto.email || !dto.password || !dto.firstName || !dto.lastName) {
      throw new BadRequestException('email, password, firstName, lastName required');
    }
    if (dto.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role || 'READONLY',
        isActive: dto.isActive !== false,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'CREATE_USER',
      entity: 'User',
      entityId: user.id,
      afterJson: { email: user.email, role: user.role },
    });

    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const search = (query.search || '').trim();
    const role = query.role;

    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as any } },
              { firstName: { contains: search, mode: 'insensitive' as any } },
              { lastName: { contains: search, mode: 'insensitive' as any } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
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
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: any, actorId?: string) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({
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
      action: 'UPDATE_USER',
      entity: 'User',
      entityId: id,
      beforeJson: { role: before.role, isActive: before.isActive },
      afterJson: { role: user.role, isActive: user.isActive },
    });

    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async resetPassword(id: string, newPassword: string, actorId?: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    // passwordChangedAt evicts every existing session for this user (the guard
    // rejects tokens issued before it) — so an admin reset actually locks out a
    // compromised session, not just the login. mustChangePassword forces the
    // user to set their own password on next login, so the admin-set one is
    // only ever temporary and the admin never knows the user's real password.
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: true },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'RESET_PASSWORD',
      entity: 'User',
      entityId: id,
    });

    return { success: true };
  }
}
