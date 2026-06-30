import { Module } from '@nestjs/common';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';

@Module({
  controllers: [GovernanceController],
  providers: [GovernanceService],
})
export class GovernanceModule {}
