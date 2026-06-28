import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let tenant = await this.prisma.tenant.findFirst();
    if (!tenant) {
      const name = process.env.TENANT_NAME || 'BizData Tenant';
      const shortName = name.split(' ')[0] || 'BizData';
      tenant = await this.prisma.tenant.create({
        data: {
          name,
          shortName,
          contactEmail: process.env.TENANT_EMAIL,
        },
      });
    }
    return tenant;
  }

  async update(dto: any) {
    const t = await this.get();
    return this.prisma.tenant.update({
      where: { id: t.id },
      data: {
        name: dto.name,
        shortName: dto.shortName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        address: dto.address,
        logoUrl: dto.logoUrl,
        themeColor: dto.themeColor,
        scanThreshold: dto.scanThreshold,
        isActive: dto.isActive,
      },
    });
  }
}
