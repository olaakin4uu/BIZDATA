import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController, TenantPublicController } from './tenant.controller';

@Module({
  controllers: [TenantController, TenantPublicController],
  providers: [TenantService],
})
export class TenantModule {}
