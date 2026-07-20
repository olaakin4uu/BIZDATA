import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { AccessAssignmentService } from './access-assignment.service';
import { AccessAssignmentController } from './access-assignment.controller';
import { AccessGrantTokenService } from './access-grant-token.service';
import { AccessGrantTokenController } from './access-grant-token.controller';

@Module({
  controllers: [AccessController, AccessAssignmentController, AccessGrantTokenController],
  providers: [AccessService, AccessAssignmentService, AccessGrantTokenService],
  exports: [AccessAssignmentService, AccessGrantTokenService],
})
export class AccessModule {}
