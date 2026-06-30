import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStaffStrategy } from './strategies/jwt-staff.strategy';
import { JwtProviderStrategy } from './strategies/jwt-provider.strategy';
import { AuditService } from './services/audit.service';
import { CryptoService } from './services/crypto.service';
import { RequestContextService } from './services/request-context.service';
import { PiiAccessService } from './services/pii-access.service';
import { RequestContextInterceptor } from './interceptors/request-context.interceptor';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'bizdata-dev-secret',
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  providers: [
    JwtStaffStrategy,
    JwtProviderStrategy,
    AuditService,
    CryptoService,
    RequestContextService,
    PiiAccessService,
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
  exports: [JwtModule, AuditService, CryptoService, RequestContextService, PiiAccessService, PassportModule],
})
export class CommonModule {}
