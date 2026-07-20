import { Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { StatutoryModule } from '../statutory/statutory.module';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [StatutoryModule, AccessModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
