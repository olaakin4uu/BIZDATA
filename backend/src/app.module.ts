import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

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
import { CasesModule } from './modules/cases/cases.module';
import { AccessModule } from './modules/access/access.module';
import { AgentsModule } from './modules/agents/agents.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { Taxpayer360Module } from './modules/taxpayer360/taxpayer360.module';
import { NdpaModule } from './modules/ndpa/ndpa.module';
import { CrossStateModule } from './modules/cross-state/cross-state.module';
import { AuditModule } from './modules/audit/audit.module';
import { SchemasModule } from './modules/schemas/schemas.module';
import { ProviderPortalModule } from './modules/provider-portal/provider-portal.module';
import { TaxNetModule } from './modules/tax-net/tax-net.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { IdentityModule } from './modules/identity/identity.module';
import { StatutoryModule } from './modules/statutory/statutory.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { ModelFeedbackModule } from './modules/model-feedback/model-feedback.module';
import { PayeModule } from './modules/paye/paye.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
    CasesModule,
    AccessModule,
    AgentsModule,
    SchedulerModule,
    NotificationsModule,
    MetricsModule,
    GovernanceModule,
    Taxpayer360Module,
    NdpaModule,
    CrossStateModule,
    AuditModule,
    SchemasModule,
    ProviderPortalModule,
    TaxNetModule,
    AnalyticsModule,
    PortfoliosModule,
    IdentityModule,
    StatutoryModule,
    IntegrationModule,
    PayeModule,
    ModelFeedbackModule,
  ],
  providers: [
    // Activate the configured throttler app-wide (it was registered but never
    // enforced). Honours per-route @Throttle overrides — e.g. the tight limits
    // on the forgot/reset-password endpoints.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
