import { Module } from '@nestjs/common';
import { LlmFactory } from './llm.factory';

/**
 * Provides the single Claude client seam (LlmFactory) so more than one feature
 * can share it — IRIS (the staff agent) and the IRIS Upload Assistant (provider
 * side). Env-driven (direct key / proxy / disabled); no per-consumer config.
 */
@Module({
  providers: [LlmFactory],
  exports: [LlmFactory],
})
export class LlmModule {}
