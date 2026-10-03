import { Module } from '@nestjs/common';
import { AuditQueryService } from './audit.service';
import { AuditController } from './audit.controller';
import { SecurityEventsController } from './security-events.controller';

@Module({
  controllers: [AuditController, SecurityEventsController],
  providers: [AuditQueryService],
})
export class AuditModule {}
