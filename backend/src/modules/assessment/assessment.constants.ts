/**
 * FinData Aptitude Assessment — configuration.
 *
 * A deliberately self-contained mini-platform: it shares the FinData URL and
 * process but NOT its database or auth. Timing and scoring rules live here.
 */

/**
 * Signing secret for assessment tokens. Passed EXPLICITLY on every sign/verify
 * so it never depends on DI — BizData's CommonModule is @Global and exports its
 * own JwtModule (JWT_SECRET), which would otherwise shadow this module's, making
 * a token signed here fail to verify. A distinct secret also guarantees BizData
 * and assessment sessions can never authenticate against each other.
 */
export const ASSESSMENT_JWT_SECRET =
  process.env.ASSESSMENT_JWT_SECRET || 'findata-assessment-dev-secret';

/** Each attempt is a single 5-minute sitting, enforced by the server clock. */
export const EXAM_DURATION_MS = 5 * 60 * 1000;

/**
 * Per-topic quota for Part 2: a fixed number of random questions is drawn from
 * each topic (TAX weighted higher). QUESTIONS_PER_ATTEMPT is derived from the sum
 * so Part 2 scoring stays consistent with the number actually asked.
 */
export const TOPIC_QUOTA: Record<string, number> = {
  TAX: 4,
  WORD: 2,
  EXCEL: 2,
  CYBERSECURITY: 2,
};
export const QUESTIONS_PER_ATTEMPT = Object.values(TOPIC_QUOTA).reduce((a, b) => a + b, 0);

/** The two parts each contribute half of the 100-point total. */
export const PART1_WEIGHT = 50;
export const PART2_WEIGHT = 50;

/** Reporting threshold (percent) — informational only; every attempt is stored. */
export const PASS_MARK = 50;

export type Part1FieldType = 'text' | 'email' | 'tel' | 'date' | 'select';

export interface Part1FieldDef {
  key: string;
  label: string;
  type: Part1FieldType;
  options?: string[];
  /** Returns true when the supplied value counts as a valid completion. */
  validate: (v: string) => boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const nonEmpty = (v: string) => !!(v && v.trim().length > 0);

/**
 * Part 1 is scored on COMPLETION (user decision): each required field that is
 * present AND correctly formatted earns an equal share of the 50 points. So a
 * fully, validly completed form scores the full 50; a half-completed one scores
 * 25. `validate` defines "correctly formatted" per field.
 */
export const PART1_FIELDS: Part1FieldDef[] = [
  { key: 'fullName', label: 'Full name', type: 'text', validate: (v) => nonEmpty(v) && v.trim().length >= 2 },
  { key: 'staffNumber', label: 'Staff number', type: 'text', validate: nonEmpty },
  {
    key: 'staffCadre',
    label: 'Staff cadre',
    type: 'select',
    options: [
      'Officer I',
      'Officer II',
      'Assistant Manager',
      'Deputy Manager',
      'Manager',
      'Senior Manager',
      'Assistant Director',
      'Deputy Director',
    ],
    validate: nonEmpty,
  },
  { key: 'email', label: 'Official email address', type: 'email', validate: (v) => EMAIL_RE.test((v || '').trim()) },
  {
    key: 'group',
    label: 'Group',
    type: 'select',
    options: [
      'Executive Chairman',
      'Finance & Account',
      'Revenue Operations',
      'Compliance and Enforcement',
      'Corporate Services',
    ],
    validate: nonEmpty,
  },
  { key: 'department', label: 'Department', type: 'text', validate: nonEmpty },
  { key: 'unitTaxOffice', label: 'Unit / Tax Office', type: 'text', validate: nonEmpty },
];

/** Public (frontend-safe) description of a Part 1 field — no validators. */
export function publicPart1Fields() {
  return PART1_FIELDS.map(({ key, label, type, options }) => ({ key, label, type, options: options ?? null }));
}

/**
 * Part 1 completion score out of PART1_WEIGHT. Pro-rated per validly completed
 * required field.
 */
export function scorePart1(part1: Record<string, unknown>): number {
  const filled = PART1_FIELDS.filter((f) => f.validate(String((part1?.[f.key] ?? '')))).length;
  return (filled / PART1_FIELDS.length) * PART1_WEIGHT;
}
