import { Module } from '@nestjs/common';
import { SubmissionsModule } from '../submissions/submissions.module';
import { LlmModule } from '../iris/llm/llm.module';
import { IrisUploadController } from './iris-upload.controller';
import { IrisUploadService } from './iris-upload.service';

/**
 * IRIS Upload Assistant. Reuses SubmissionsService (the real ingestion pipeline)
 * and the shared LlmModule (Claude seam). CommonModule (Crypto/Audit) and
 * PrismaModule are @Global, so they're injected without importing.
 */
@Module({
  imports: [SubmissionsModule, LlmModule],
  controllers: [IrisUploadController],
  providers: [IrisUploadService],
})
export class IrisUploadModule {}
