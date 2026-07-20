import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { AccessAssignmentService } from './access-assignment.service';
import { AccessAssignmentController } from './access-assignment.controller';

@Module({
  controllers: [AccessController, AccessAssignmentController],
  providers: [AccessService, AccessAssignmentService],
  exports: [AccessAssignmentService],
})
export class AccessModule {}
