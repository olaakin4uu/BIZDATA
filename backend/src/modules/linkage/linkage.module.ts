import { Module } from '@nestjs/common';
import { LinkageService } from './linkage.service';
import { LinkageController } from './linkage.controller';

@Module({
  controllers: [LinkageController],
  providers: [LinkageService],
})
export class LinkageModule {}
