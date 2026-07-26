import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentDbService } from './assessment-db.service';
import { AdminGuard, CandidateGuard } from './assessment.guards';

/**
 * Self-contained aptitude-test platform. Its JwtModule is registered LOCALLY
 * with ASSESSMENT_JWT_SECRET (NOT the global BizData JWT_SECRET), so assessment
 * tokens are cryptographically separate from staff/provider sessions and cannot
 * cross over. Data access goes through AssessmentDbService, which owns a pool on
 * a separate database — this module never touches PrismaService or tax data.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.ASSESSMENT_JWT_SECRET || 'findata-assessment-dev-secret',
      }),
    }),
  ],
  controllers: [AssessmentController],
  providers: [AssessmentService, AssessmentDbService, CandidateGuard, AdminGuard],
})
export class AssessmentModule {}
