import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { DEFAULT_SCHEMAS } from '../submissions/submission-parser';

@Injectable()
export class SchemasService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async findAll() {
    const stored = await this.prisma.providerSchema.findMany({ orderBy: { providerType: 'asc' } });
    const storedByType = new Map(stored.map(s => [s.providerType, s]));
    // Merge defaults with stored
    const result = Object.keys(DEFAULT_SCHEMAS).map(type => {
      const s = storedByType.get(type as any);
      if (s) return s;
      return {
        id: null,
        providerType: type,
        name: `Default ${type} Schema`,
        description: 'Built-in default — not stored in DB',
        columns: DEFAULT_SCHEMAS[type].columns,
        isActive: true,
        isDefault: true,
      };
    });
    return result;
  }

  async findOne(providerType: string) {
    const stored = await this.prisma.providerSchema.findUnique({ where: { providerType: providerType as any } });
    if (stored) return stored;
    const def = DEFAULT_SCHEMAS[providerType];
    if (!def) throw new NotFoundException('Provider type not found');
    return {
      id: null,
      providerType,
      name: `Default ${providerType} Schema`,
      description: 'Built-in default',
      columns: def.columns,
      isActive: true,
      isDefault: true,
    };
  }

  async upsert(providerType: string, dto: any, actorId?: string) {
    if (!DEFAULT_SCHEMAS[providerType]) throw new BadRequestException('Unknown provider type');
    if (!Array.isArray(dto.columns)) throw new BadRequestException('columns must be an array');

    const result = await this.prisma.providerSchema.upsert({
      where: { providerType: providerType as any },
      update: {
        name: dto.name ?? `${providerType} Schema`,
        description: dto.description,
        columns: dto.columns,
        isActive: dto.isActive ?? true,
      },
      create: {
        providerType: providerType as any,
        name: dto.name || `${providerType} Schema`,
        description: dto.description,
        columns: dto.columns,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPDATE_SCHEMA',
      entity: 'ProviderSchema',
      entityId: result.id,
      afterJson: { providerType },
    });

    return result;
  }
}
