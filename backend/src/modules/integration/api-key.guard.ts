import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { IntegrationService } from './integration.service';

/**
 * Authenticates a partner-platform request by its API key (x-api-key header).
 * On success, attaches the key record to the request as `req.partner`.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private integration: IntegrationService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const rawKey = req.headers['x-api-key'];
    const partner = await this.integration.authenticatePartner(rawKey);
    req.partner = partner;
    return true;
  }
}
