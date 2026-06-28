import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ProviderAuthGuard extends AuthGuard('jwt-provider') {}
