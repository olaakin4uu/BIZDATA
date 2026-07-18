import { Module } from '@nestjs/common';
import { PayeService } from './paye.service';
import { PayeController, IntegrationPayeController } from './paye.controller';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  // IntegrationModule provides ApiKeyGuard (used by IntegrationPayeController).
  imports: [IntegrationModule],
  controllers: [PayeController, IntegrationPayeController],
  providers: [PayeService],
  exports: [PayeService],
})
export class PayeModule {}
