import { Module } from '@nestjs/common';
import { ProviderUsersService } from './provider-users.service';
import { ProviderUsersController } from './provider-users.controller';

@Module({
  controllers: [ProviderUsersController],
  providers: [ProviderUsersService],
})
export class ProviderUsersModule {}
