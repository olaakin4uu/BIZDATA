import { Module } from '@nestjs/common';
import { ModelFeedbackService } from './model-feedback.service';
import { ModelFeedbackController } from './model-feedback.controller';

@Module({
  controllers: [ModelFeedbackController],
  providers: [ModelFeedbackService],
  exports: [ModelFeedbackService],
})
export class ModelFeedbackModule {}
