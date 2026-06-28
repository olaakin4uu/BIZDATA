import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStaffStrategy } from './strategies/jwt-staff.strategy';
import { JwtProviderStrategy } from './strategies/jwt-provider.strategy';
import { AuditService } from './services/audit.service';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'bizdata-dev-secret',
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  providers: [JwtStaffStrategy, JwtProviderStrategy, AuditService],
  exports: [JwtModule, AuditService, PassportModule],
})
export class CommonModule {}
