import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';

import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UsersModule } from './modules/users/users.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { ProviderUsersModule } from './modules/provider-users/provider-users.module';
import { TaxpayersModule } from './modules/taxpayers/taxpayers.module';
import { DeclaredIncomeModule } from './modules/declared-income/declared-income.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { DataRecordsModule } from './modules/data-records/data-records.module';
import { ScanModule } from './modules/scan/scan.module';
import { AuditModule } from './modules/audit/audit.module';
import { SchemasModule } from './modules/schemas/schemas.module';
import { ProviderPortalModule } from './modules/provider-portal/provider-portal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    CommonModule,
    AuthModule,
    TenantModule,
    UsersModule,
    ProvidersModule,
    ProviderUsersModule,
    TaxpayersModule,
    DeclaredIncomeModule,
    SubmissionsModule,
    DataRecordsModule,
    ScanModule,
    AuditModule,
    SchemasModule,
    ProviderPortalModule,
  ],
})
export class AppModule {}
