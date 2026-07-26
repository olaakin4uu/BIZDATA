import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AssessmentDbService } from './assessment-db.service';
import {
  ASSESSMENT_JWT_SECRET,
  EXAM_DURATION_MS,
  PART2_WEIGHT,
  PASS_MARK,
  QUESTIONS_PER_ATTEMPT,
  TOPIC_QUOTA,
  publicPart1Fields,
  scorePart1,
} from './assessment.constants';

interface AttemptQuestion {
  questionId: string;
  topic: string;
  title: string | null;
  stem: string;
  options: string[];
  correctIndex: number; // server-only — never sent to the candidate
  competency: string | null;
  isCaseStudy: boolean;
  chosenIndex: number | null;
}

interface AttemptRow {
  id: string;
  participant_id: string;
  started_at: Date;
  expires_at: Date;
  submitted_at: Date | null;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  part1: Record<string, string>;
  questions: AttemptQuestion[];
  part1_score: string | null;
  part2_score: string | null;
  total_score: string | null;
}

// Unambiguous alphabet for access codes (no O/0, I/1) — easy to read aloud/type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

@Injectable()
export class AssessmentService {
  constructor(private db: AssessmentDbService, private jwt: JwtService) {}

  // ── Candidate flow ─────────────────────────────────────────────────────────

  /** Log in with an access code. Creates the attempt on first use, or resumes
   *  the SAME sitting (same countdown) on a later login — never restarts it. */
  async candidateLogin(accessCode: string) {
    const code = (accessCode || '').trim().toUpperCase();
    const { rows } = await this.db.query('SELECT id, label FROM participant WHERE access_code = $1', [code]);
    const participant = rows[0];
    if (!participant) throw new UnauthorizedException('Invalid access code');

    let attempt = await this.findAttempt(participant.id);
    if (!attempt) attempt = await this.createAttempt(participant.id);
    else attempt = await this.finalizeIfExpired(attempt);

    const token = this.jwt.sign(
      { kind: 'CANDIDATE', sub: attempt.id, pid: participant.id },
      { secret: ASSESSMENT_JWT_SECRET, expiresIn: '45m' },
    );
    return { token, state: this.candidateState(attempt) };
  }

  async getState(attemptId: string) {
    const attempt = await this.finalizeIfExpired(await this.requireAttempt(attemptId));
    return this.candidateState(attempt);
  }

  async savePart1(attemptId: string, details: Record<string, string>) {
    const attempt = await this.assertActive(attemptId);
    const merged = { ...(attempt.part1 || {}), ...(details || {}) };
    await this.db.query('UPDATE attempt SET part1 = $2 WHERE id = $1', [attemptId, JSON.stringify(merged)]);
    return this.candidateState({ ...attempt, part1: merged });
  }

  async saveAnswer(attemptId: string, questionId: string, chosenIndex: number) {
    const attempt = await this.assertActive(attemptId);
    const questions = attempt.questions.map((q) =>
      q.questionId === questionId
        ? { ...q, chosenIndex: chosenIndex >= 0 && chosenIndex < q.options.length ? chosenIndex : q.chosenIndex }
        : q,
    );
    if (!questions.some((q) => q.questionId === questionId)) {
      throw new BadRequestException('Question is not part of this attempt');
    }
    await this.db.query('UPDATE attempt SET questions = $2 WHERE id = $1', [attemptId, JSON.stringify(questions)]);
    return this.candidateState({ ...attempt, questions });
  }

  /** Explicit submit (or the client-side timer reaching zero). Marks and locks. */
  async submit(attemptId: string) {
    const attempt = await this.requireAttempt(attemptId);
    if (attempt.status !== 'IN_PROGRESS') return this.candidateState(attempt);
    const finalized = await this.finalize(attempt, 'SUBMITTED');
    return this.candidateState(finalized);
  }

  // ── Attempt helpers ──────────────────────────────────────────────────────

  private async findAttempt(participantId: string): Promise<AttemptRow | null> {
    const { rows } = await this.db.query<AttemptRow>('SELECT * FROM attempt WHERE participant_id = $1', [participantId]);
    return rows[0] ?? null;
  }

  private async requireAttempt(attemptId: string): Promise<AttemptRow> {
    const { rows } = await this.db.query<AttemptRow>('SELECT * FROM attempt WHERE id = $1', [attemptId]);
    if (!rows[0]) throw new NotFoundException('Attempt not found');
    return rows[0];
  }

  /** Loads the attempt and refuses if the sitting is over — the authoritative
   *  server-side deadline check that a client timer cannot bypass. */
  private async assertActive(attemptId: string): Promise<AttemptRow> {
    const attempt = await this.finalizeIfExpired(await this.requireAttempt(attemptId));
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ForbiddenException('Your time has elapsed — this attempt is closed.');
    }
    return attempt;
  }

  private async createAttempt(participantId: string): Promise<AttemptRow> {
    // Fixed per-topic quota (TAX weighted higher — see TOPIC_QUOTA). Draw the
    // configured number of random questions from each topic; if a topic is short
    // on active questions, backfill from the rest so the count stays stable; then
    // shuffle so the topics interleave rather than appearing in blocks.
    const picked: any[] = [];
    for (const [topic, quota] of Object.entries(TOPIC_QUOTA)) {
      if (quota <= 0) continue;
      const { rows: qs } = await this.db.query(
        `SELECT id, topic, title, stem, options, correct_index, competency, is_case_study
           FROM question WHERE active = true AND topic = $1 ORDER BY random() LIMIT $2`,
        [topic, quota],
      );
      picked.push(...qs);
    }
    if (picked.length < QUESTIONS_PER_ATTEMPT) {
      const have = picked.map((q: any) => q.id);
      const { rows: extra } = await this.db.query(
        `SELECT id, topic, title, stem, options, correct_index, competency, is_case_study
           FROM question WHERE active = true AND id <> ALL($2::uuid[])
           ORDER BY random() LIMIT $1`,
        [QUESTIONS_PER_ATTEMPT - picked.length, have],
      );
      picked.push(...extra);
    }
    const rows = shuffle(picked);
    if (rows.length === 0) throw new BadRequestException('No questions are configured yet.');

    const questions: AttemptQuestion[] = rows.map((q: any) => {
      const opts: string[] = Array.isArray(q.options) ? q.options : JSON.parse(q.options);
      const { options, correctIndex } = shuffleOptions(opts, q.correct_index);
      return {
        questionId: q.id,
        topic: q.topic,
        title: q.title ?? null,
        stem: q.stem,
        options,
        correctIndex,
        competency: q.competency ?? null,
        isCaseStudy: q.is_case_study,
        chosenIndex: null,
      };
    });

    const expiresAt = new Date(Date.now() + EXAM_DURATION_MS);
    const { rows: created } = await this.db.query<AttemptRow>(
      `INSERT INTO attempt (participant_id, expires_at, questions)
       VALUES ($1, $2, $3) RETURNING *`,
      [participantId, expiresAt, JSON.stringify(questions)],
    );
    return created[0];
  }

  private async finalizeIfExpired(attempt: AttemptRow): Promise<AttemptRow> {
    if (attempt.status === 'IN_PROGRESS' && new Date(attempt.expires_at).getTime() <= Date.now()) {
      return this.finalize(attempt, 'EXPIRED');
    }
    return attempt;
  }

  private async finalize(attempt: AttemptRow, status: 'SUBMITTED' | 'EXPIRED'): Promise<AttemptRow> {
    const part1Score = round2(scorePart1(attempt.part1 || {}));
    const correct = (attempt.questions || []).filter((q) => q.chosenIndex != null && q.chosenIndex === q.correctIndex).length;
    const part2Score = round2((correct / QUESTIONS_PER_ATTEMPT) * PART2_WEIGHT);
    const total = round2(part1Score + part2Score);
    const { rows } = await this.db.query<AttemptRow>(
      `UPDATE attempt SET status = $2, submitted_at = now(),
         part1_score = $3, part2_score = $4, total_score = $5
       WHERE id = $1 RETURNING *`,
      [attempt.id, status, part1Score, part2Score, total],
    );
    return rows[0];
  }

  /** Candidate-safe projection — strips every correctIndex. */
  private candidateState(attempt: AttemptRow) {
    const finalized = attempt.status !== 'IN_PROGRESS';
    const remainingMs = Math.max(0, new Date(attempt.expires_at).getTime() - Date.now());
    return {
      attemptId: attempt.id,
      status: attempt.status,
      serverNow: new Date().toISOString(),
      expiresAt: new Date(attempt.expires_at).toISOString(),
      remainingMs: finalized ? 0 : remainingMs,
      durationMs: EXAM_DURATION_MS,
      part1Fields: publicPart1Fields(),
      part1: attempt.part1 || {},
      questions: finalized
        ? []
        : (attempt.questions || []).map((q) => ({
            questionId: q.questionId,
            topic: q.topic,
            stem: q.stem,
            options: q.options,
            isCaseStudy: q.isCaseStudy,
            chosenIndex: q.chosenIndex,
          })),
      // Candidates NEVER see their score — only a submission confirmation. Scores
      // are still computed and stored server-side and are visible to the admin.
      result: finalized ? { submitted: true } : null,
    };
  }

  // ── Admin flow ───────────────────────────────────────────────────────────

  async adminLogin(username: string, password: string) {
    const { rows } = await this.db.query('SELECT id, username, password_hash FROM admin_user WHERE username = $1', [
      (username || '').trim(),
    ]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.jwt.sign(
      { kind: 'ADMIN', sub: admin.id, username: admin.username },
      { secret: ASSESSMENT_JWT_SECRET, expiresIn: '12h' },
    );
    return { token, admin: { id: admin.id, username: admin.username } };
  }

  async listResults() {
    const { rows } = await this.db.query(
      `SELECT a.id, a.status, a.started_at, a.submitted_at, a.expires_at,
              a.part1_score, a.part2_score, a.total_score,
              a.part1->>'fullName' AS full_name, a.part1->>'email' AS email,
              p.access_code, p.label
         FROM attempt a JOIN participant p ON p.id = a.participant_id
        ORDER BY a.started_at DESC`,
    );
    return rows.map((r: any) => ({
      attemptId: r.id,
      accessCode: r.access_code,
      label: r.label,
      fullName: r.full_name,
      email: r.email,
      status: r.status,
      startedAt: r.started_at,
      submittedAt: r.submitted_at,
      part1Score: num(r.part1_score),
      part2Score: num(r.part2_score),
      totalScore: num(r.total_score),
      passed: num(r.total_score) >= PASS_MARK,
    }));
  }

  async getResult(attemptId: string) {
    const attempt = await this.finalizeIfExpired(await this.requireAttempt(attemptId));
    const { rows } = await this.db.query('SELECT access_code, label FROM participant WHERE id = $1', [
      attempt.participant_id,
    ]);
    const correct = (attempt.questions || []).filter((q) => q.chosenIndex != null && q.chosenIndex === q.correctIndex).length;
    return {
      attemptId: attempt.id,
      accessCode: rows[0]?.access_code,
      label: rows[0]?.label,
      status: attempt.status,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      part1: attempt.part1 || {},
      part1Fields: publicPart1Fields(),
      part1Score: num(attempt.part1_score),
      part2Score: num(attempt.part2_score),
      totalScore: num(attempt.total_score),
      correctCount: correct,
      totalQuestions: (attempt.questions || []).length,
      passMark: PASS_MARK,
      passed: num(attempt.total_score) >= PASS_MARK,
      // Full breakdown for the admin only — includes the correct answer.
      questions: (attempt.questions || []).map((q) => ({
        topic: q.topic,
        title: q.title ?? null,
        stem: q.stem,
        options: q.options,
        competency: q.competency ?? null,
        isCaseStudy: q.isCaseStudy,
        chosenIndex: q.chosenIndex,
        correctIndex: q.correctIndex,
        correct: q.chosenIndex != null && q.chosenIndex === q.correctIndex,
      })),
    };
  }

  async createParticipants(count?: number, labels?: string[]) {
    const items: { label: string | null }[] =
      labels && labels.length ? labels.map((l) => ({ label: (l || '').trim() || null })) : Array.from({ length: Math.max(1, count ?? 1) }, () => ({ label: null }));

    const created: { accessCode: string; label: string | null }[] = [];
    for (const item of items) {
      const code = await this.uniqueCode();
      await this.db.query('INSERT INTO participant (access_code, label) VALUES ($1, $2)', [code, item.label]);
      created.push({ accessCode: code, label: item.label });
    }
    return { created };
  }

  async stats() {
    const { rows } = await this.db.query(
      `SELECT
         (SELECT count(*)::int FROM participant) AS participants,
         (SELECT count(*)::int FROM attempt) AS attempts,
         (SELECT count(*)::int FROM attempt WHERE status <> 'IN_PROGRESS') AS completed,
         (SELECT count(*)::int FROM attempt WHERE total_score >= $1) AS passed,
         (SELECT round(avg(total_score), 1) FROM attempt WHERE status <> 'IN_PROGRESS') AS avg_score,
         (SELECT count(*)::int FROM question WHERE active = true) AS active_questions`,
      [PASS_MARK],
    );
    const r = rows[0] || {};
    return {
      participants: r.participants ?? 0,
      attempts: r.attempts ?? 0,
      completed: r.completed ?? 0,
      passed: r.passed ?? 0,
      avgScore: num(r.avg_score),
      activeQuestions: r.active_questions ?? 0,
      passMark: PASS_MARK,
    };
  }

  // ── Question management (admin) ──────────────────────────────────────────
  async listQuestions() {
    const { rows } = await this.db.query(
      `SELECT id, topic, title, stem, options, correct_index, competency, is_case_study, active
         FROM question ORDER BY active DESC, topic, created_at`,
    );
    return rows.map((r: any) => ({
      id: r.id,
      topic: r.topic,
      title: r.title,
      stem: r.stem,
      options: Array.isArray(r.options) ? r.options : JSON.parse(r.options),
      correctIndex: r.correct_index,
      competency: r.competency,
      isCaseStudy: r.is_case_study,
      active: r.active,
    }));
  }

  async createQuestion(dto: any) {
    const q = this.normalizeQuestion(dto);
    const { rows } = await this.db.query(
      `INSERT INTO question (topic, title, stem, options, correct_index, competency, is_case_study, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [q.topic, q.title, q.stem, JSON.stringify(q.options), q.correctIndex, q.competency, q.isCaseStudy, q.active],
    );
    return { id: rows[0].id };
  }

  async updateQuestion(id: string, dto: any) {
    const q = this.normalizeQuestion(dto);
    const { rowCount } = await this.db.query(
      `UPDATE question SET topic=$2, title=$3, stem=$4, options=$5, correct_index=$6, competency=$7, is_case_study=$8, active=$9
       WHERE id=$1`,
      [id, q.topic, q.title, q.stem, JSON.stringify(q.options), q.correctIndex, q.competency, q.isCaseStudy, q.active],
    );
    if (!rowCount) throw new NotFoundException('Question not found');
    return { ok: true };
  }

  async setQuestionActive(id: string, active: boolean) {
    const { rowCount } = await this.db.query('UPDATE question SET active=$2 WHERE id=$1', [id, !!active]);
    if (!rowCount) throw new NotFoundException('Question not found');
    return { ok: true };
  }

  private normalizeQuestion(dto: any) {
    const topic = String(dto.topic || '').toUpperCase();
    if (!['EXCEL', 'WORD', 'CYBERSECURITY', 'TAX'].includes(topic)) {
      throw new BadRequestException('Topic must be EXCEL, WORD, CYBERSECURITY or TAX');
    }
    const stem = String(dto.stem || '').trim();
    if (!stem) throw new BadRequestException('Question text is required');
    const options = Array.isArray(dto.options) ? dto.options.map((o: any) => String(o ?? '').trim()) : [];
    if (options.length !== 4 || options.some((o: string) => !o)) {
      throw new BadRequestException('Provide exactly 4 non-empty options');
    }
    const correctIndex = Number(dto.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      throw new BadRequestException('Correct option must be one of the 4 options');
    }
    return {
      topic,
      title: dto.title ? String(dto.title).trim() : null,
      stem,
      options,
      correctIndex,
      competency: dto.competency ? String(dto.competency).trim() : null,
      isCaseStudy: !!dto.isCaseStudy,
      active: dto.active === undefined ? true : !!dto.active,
    };
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const code = genCode();
      const { rows } = await this.db.query('SELECT 1 FROM participant WHERE access_code = $1', [code]);
      if (rows.length === 0) return code;
    }
    throw new BadRequestException('Could not allocate a unique access code — try again.');
  }
}

// ── pure helpers ─────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleOptions(options: string[], correctIndex: number): { options: string[]; correctIndex: number } {
  const idx = options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { options: idx.map((i) => options[i]), correctIndex: idx.indexOf(correctIndex) };
}

function genCode(): string {
  const bytes = randomBytes(6);
  let body = '';
  for (let i = 0; i < 6; i++) body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `FD-${body}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
