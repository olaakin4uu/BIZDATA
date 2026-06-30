import { Module } from '@nestjs/common';
import { Taxpayer360Service } from './taxpayer360.service';
import { Taxpayer360Controller } from './taxpayer360.controller';

@Module({
  controllers: [Taxpayer360Controller],
  providers: [Taxpayer360Service],
})
export class Taxpayer360Module {}
