import { Module } from '@nestjs/common';
import { PiiController } from './pii.controller';

@Module({ controllers: [PiiController] })
export class PiiModule {}
