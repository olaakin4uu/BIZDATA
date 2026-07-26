import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { AdminGuard, CandidateGuard } from './assessment.guards';
import {
  AdminLoginDto,
  AnswerDto,
  CandidateLoginDto,
  CreateParticipantsDto,
  Part1Dto,
  SetActiveDto,
  UpsertQuestionDto,
} from './dto';

/**
 * All routes are mounted under /api/assessment. Candidate routes carry a
 * CANDIDATE token bound to a single attempt; admin routes carry an ADMIN token.
 * Both are signed with the assessment's own JWT secret (see the module).
 */
@Controller('assessment')
export class AssessmentController {
  constructor(private readonly svc: AssessmentService) {}

  // ── Candidate ──────────────────────────────────────────────────────────────
  @Post('login')
  candidateLogin(@Body() dto: CandidateLoginDto) {
    return this.svc.candidateLogin(dto.accessCode);
  }

  @UseGuards(CandidateGuard)
  @Get('state')
  state(@Req() req: any) {
    return this.svc.getState(req.assessment.sub);
  }

  @UseGuards(CandidateGuard)
  @Post('part1')
  savePart1(@Req() req: any, @Body() dto: Part1Dto) {
    return this.svc.savePart1(req.assessment.sub, dto.details || {});
  }

  @UseGuards(CandidateGuard)
  @Post('answer')
  answer(@Req() req: any, @Body() dto: AnswerDto) {
    return this.svc.saveAnswer(req.assessment.sub, dto.questionId, dto.chosenIndex);
  }

  @UseGuards(CandidateGuard)
  @Post('submit')
  submit(@Req() req: any) {
    return this.svc.submit(req.assessment.sub);
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  @Post('admin/login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.svc.adminLogin(dto.username, dto.password);
  }

  @UseGuards(AdminGuard)
  @Get('admin/stats')
  stats() {
    return this.svc.stats();
  }

  @UseGuards(AdminGuard)
  @Get('admin/results')
  results() {
    return this.svc.listResults();
  }

  @UseGuards(AdminGuard)
  @Get('admin/results/:attemptId')
  result(@Param('attemptId') attemptId: string) {
    return this.svc.getResult(attemptId);
  }

  @UseGuards(AdminGuard)
  @Post('admin/participants')
  createParticipants(@Body() dto: CreateParticipantsDto) {
    return this.svc.createParticipants(dto.count, dto.labels);
  }

  // ── Admin: question bank management ────────────────────────────────────────
  @UseGuards(AdminGuard)
  @Get('admin/questions')
  listQuestions() {
    return this.svc.listQuestions();
  }

  @UseGuards(AdminGuard)
  @Post('admin/questions')
  createQuestion(@Body() dto: UpsertQuestionDto) {
    return this.svc.createQuestion(dto);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpsertQuestionDto) {
    return this.svc.updateQuestion(id, dto);
  }

  @UseGuards(AdminGuard)
  @Post('admin/questions/:id/active')
  setQuestionActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.svc.setQuestionActive(id, dto.active);
  }
}
