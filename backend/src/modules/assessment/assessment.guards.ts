import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ASSESSMENT_JWT_SECRET } from './assessment.constants';

/**
 * Assessment tokens are signed with ASSESSMENT_JWT_SECRET — a DIFFERENT secret
 * from BizData's JWT_SECRET. A BizData staff/provider token therefore cannot
 * authenticate here, and an assessment token cannot authenticate against BizData
 * endpoints. `kind` further separates candidate sessions from admin sessions.
 */
function verify(ctx: ExecutionContext, jwt: JwtService, kind: 'CANDIDATE' | 'ADMIN') {
  const req = ctx.switchToHttp().getRequest();
  const header: string | undefined = req.headers?.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');
  let payload: any;
  try {
    payload = jwt.verify(header.slice(7), { secret: ASSESSMENT_JWT_SECRET });
  } catch {
    throw new UnauthorizedException('Invalid or expired session');
  }
  if (payload.kind !== kind) throw new UnauthorizedException('Wrong session type');
  req.assessment = payload;
  return true;
}

@Injectable()
export class CandidateGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext) {
    return verify(ctx, this.jwt, 'CANDIDATE');
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext) {
    return verify(ctx, this.jwt, 'ADMIN');
  }
}
