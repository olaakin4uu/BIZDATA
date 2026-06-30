import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestContextService } from '../services/request-context.service';

/**
 * Runs after the auth guard (so req.user is populated) and seeds the
 * AsyncLocalStorage request context with the current staff id/role/IP. Uses
 * enterWith so the context persists for the downstream handler execution.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly ctx: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    this.ctx.enter({
      staffId: user?.id,
      role: user?.role,
      ip: req?.ip || req?.headers?.['x-forwarded-for'],
    });
    return next.handle();
  }
}
