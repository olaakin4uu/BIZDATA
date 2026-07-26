import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { KIRS_QUESTIONS } from './assessment.questions.kirs';

/**
 * Data access for the aptitude-test platform.
 *
 * DELIBERATELY isolated from BizData: its own connection pool pointed at a
 * SEPARATE database (ASSESSMENT_DATABASE_URL → findata_assessment_db). It never
 * imports PrismaService, so it structurally cannot read or write the tax tables.
 * The schema is created idempotently on boot (plain SQL — no Prisma migrations
 * for this DB), and an empty bank/admin is bootstrapped from env + the seed file.
 */
@Injectable()
export class AssessmentDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssessmentDbService.name);
  private pool: Pool;

  async onModuleInit() {
    const connectionString =
      process.env.ASSESSMENT_DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5433/findata_assessment_db?schema=public';
    this.pool = new Pool({ connectionString });
    await this.ensureSchema();
    await this.ensureSeed();
    this.logger.log('Assessment DB ready (isolated from BizData).');
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number | null }> {
    return this.pool.query(text, params) as any;
  }

  private async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS admin_user (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username      text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS participant (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        access_code text UNIQUE NOT NULL,
        label       text,
        created_at  timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS question (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        topic         text NOT NULL,
        title         text,
        stem          text NOT NULL,
        options       jsonb NOT NULL,
        correct_index int  NOT NULL,
        competency    text,
        is_case_study boolean NOT NULL DEFAULT false,
        active        boolean NOT NULL DEFAULT true,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
      -- Additive columns for the KIRS-pattern bank (title + competency assessed),
      -- applied to pre-existing tables too.
      ALTER TABLE question ADD COLUMN IF NOT EXISTS title text;
      ALTER TABLE question ADD COLUMN IF NOT EXISTS competency text;

      CREATE TABLE IF NOT EXISTS attempt (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        participant_id uuid NOT NULL UNIQUE REFERENCES participant(id) ON DELETE CASCADE,
        started_at     timestamptz NOT NULL DEFAULT now(),
        expires_at     timestamptz NOT NULL,
        submitted_at   timestamptz,
        status         text NOT NULL DEFAULT 'IN_PROGRESS',
        part1          jsonb NOT NULL DEFAULT '{}'::jsonb,
        questions      jsonb NOT NULL DEFAULT '[]'::jsonb,
        part1_score    numeric,
        part2_score    numeric,
        total_score    numeric
      );
    `);
  }

  /** Bootstrap an admin (from env) and the question bank if either is empty. */
  private async ensureSeed() {
    const username = (process.env.ASSESSMENT_ADMIN_USER || 'admin').trim();
    const envPassword = process.env.ASSESSMENT_ADMIN_PASSWORD;
    const { rows: admins } = await this.pool.query(
      'SELECT id, password_hash FROM admin_user WHERE username = $1',
      [username],
    );
    if (admins.length === 0) {
      const hash = await bcrypt.hash(envPassword || 'Assess@1234', 10);
      await this.pool.query('INSERT INTO admin_user (username, password_hash) VALUES ($1, $2)', [username, hash]);
      this.logger.log(`Seeded assessment admin "${username}".`);
    } else if (envPassword) {
      // Env is the source of truth for the admin password: rotate the stored hash
      // whenever ASSESSMENT_ADMIN_PASSWORD changes (idempotent — no-op if it matches).
      const matches = await bcrypt.compare(envPassword, admins[0].password_hash);
      if (!matches) {
        const hash = await bcrypt.hash(envPassword, 10);
        await this.pool.query('UPDATE admin_user SET password_hash = $2 WHERE id = $1', [admins[0].id, hash]);
        this.logger.log(`Rotated assessment admin "${username}" password from env.`);
      }
    }

    const { rows: qs } = await this.pool.query('SELECT count(*)::int AS n FROM question');
    if ((qs[0]?.n ?? 0) === 0) {
      for (const q of KIRS_QUESTIONS) {
        await this.pool.query(
          'INSERT INTO question (topic, title, stem, options, correct_index, competency, is_case_study) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [q.topic, q.title ?? null, q.stem, JSON.stringify(q.options), q.correctIndex, q.competency ?? null, q.isCaseStudy ?? false],
        );
      }
      this.logger.log(`Seeded ${KIRS_QUESTIONS.length} KIRS assessment questions.`);
    }
  }
}
