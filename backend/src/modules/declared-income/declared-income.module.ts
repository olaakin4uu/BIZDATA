import { Module } from '@nestjs/common';
import { DeclaredIncomeService } from './declared-income.service';
import { DeclaredIncomeController } from './declared-income.controller';

@Module({
  controllers: [DeclaredIncomeController],
  providers: [DeclaredIncomeService],
})
export class DeclaredIncomeModule {}
