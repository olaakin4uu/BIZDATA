import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let tenant = await this.prisma.tenant.findFirst();
    if (!tenant) {
      const name = process.env.TENANT_NAME || 'FinData Tenant';
      const shortName = name.split(' ')[0] || 'FinData';
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

  /** Public branding (safe subset) for the unauthenticated login screen. */
  async branding() {
    const t = await this.get();
    return { name: t.name, shortName: t.shortName, logoUrl: t.logoUrl, themeColor: t.themeColor };
  }

  /** Store an uploaded logo as a self-contained data URI in logoUrl. */
  async setLogo(buffer: Buffer, mime: string) {
    const t = await this.get();
    const logoUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    const updated = await this.prisma.tenant.update({ where: { id: t.id }, data: { logoUrl } });
    return { logoUrl: updated.logoUrl };
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
