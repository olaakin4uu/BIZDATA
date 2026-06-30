import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  staffId?: string;
  role?: string;
  ip?: string;
  piiLogged?: boolean; // set once a PII-access event has been recorded this request
}

/**
 * Per-request context carried via AsyncLocalStorage so deep services (e.g. the
 * PII access policy) can know who the current viewer is without threading the
 * user through every method signature. Populated by RequestContextInterceptor
 * once authentication has run.
 */
@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  /** Establish a fresh context for the remainder of this async execution. */
  enter(ctx: RequestContext) {
    this.als.enterWith(ctx);
  }

  get(): RequestContext | undefined {
    return this.als.getStore();
  }

  get staffId(): string | undefined {
    return this.als.getStore()?.staffId;
  }

  get role(): string | undefined {
    return this.als.getStore()?.role;
  }
}
