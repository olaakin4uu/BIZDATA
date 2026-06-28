import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../services/audit.service';

/**
 * Lightweight interceptor that audits write requests automatically.
 * For now this is opt-in via @UseInterceptors(AuditInterceptor).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url;

    return next.handle().pipe(
      tap(() => {
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
          const user = req.user;
          this.audit.log({
            actorType: user?.providerId ? 'PROVIDER_USER' : 'STAFF',
            actorId: user?.id,
            staffId: user?.providerId ? undefined : user?.id,
            action: `${method} ${url}`,
            entity: 'HTTP',
            ip: req.ip,
            userAgent: req.headers?.['user-agent'],
          });
        }
      }),
    );
  }
}
