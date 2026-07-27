'use client';

/**
 * Assessment platform API client — DELIBERATELY separate from BizData's
 * `@/lib/api/client`. It uses its own token keys and its own 401 handling, so a
 * candidate whose session ends is returned to the ASSESSMENT login, never bounced
 * into the BizData staff login. Same origin/URL, different platform.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';

const CAND_KEY = 'findata_assessment_token';
const ADMIN_KEY = 'findata_assessment_admin_token';

export const candToken = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(CAND_KEY)),
  set: (t: string) => localStorage.setItem(CAND_KEY, t),
  clear: () => localStorage.removeItem(CAND_KEY),
};
export const adminToken = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(ADMIN_KEY)),
  set: (t: string) => localStorage.setItem(ADMIN_KEY, t),
  clear: () => localStorage.removeItem(ADMIN_KEY),
};

// Public org branding (name + logo data-URI) — same endpoint the staff login uses,
// so the assessment pages show the configured KIRS logo without any coupling.
export const brandingApi = {
  get: () => req<{ name?: string; shortName?: string; logoUrl?: string | null }>('/tenant/branding'),
};

async function req<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const d = await res.json();
      message = d.message || d.error || message;
      if (Array.isArray(message)) message = message.join('; ');
    } catch {
      /* ignore */
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ── Types (mirror the backend candidate/admin projections) ───────────────────
export interface Part1FieldDef {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'date' | 'select';
  options: string[] | null;
}
export interface ExamQuestion {
  questionId: string;
  topic: string;
  stem: string;
  options: string[];
  isCaseStudy: boolean;
  chosenIndex: number | null;
}
export interface ExamResult {
  // Candidates only get a submission confirmation — never their score.
  submitted: boolean;
}
export interface ExamState {
  attemptId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  serverNow: string;
  expiresAt: string;
  remainingMs: number;
  durationMs: number;
  part1Fields: Part1FieldDef[];
  part1: Record<string, string>;
  questions: ExamQuestion[];
  result: ExamResult | null;
}

export const candidateApi = {
  login: (accessCode: string) =>
    req<{ token: string; state: ExamState }>('/assessment/login', { method: 'POST', body: { accessCode } }),
  state: () => req<ExamState>('/assessment/state', { token: candToken.get() }),
  savePart1: (details: Record<string, string>) =>
    req<ExamState>('/assessment/part1', { method: 'POST', body: { details }, token: candToken.get() }),
  saveAnswer: (questionId: string, chosenIndex: number) =>
    req<ExamState>('/assessment/answer', { method: 'POST', body: { questionId, chosenIndex }, token: candToken.get() }),
  submit: () => req<ExamState>('/assessment/submit', { method: 'POST', token: candToken.get() }),
};

// ── Admin ────────────────────────────────────────────────────────────────────
export interface ResultRow {
  attemptId: string;
  accessCode: string;
  label: string | null;
  fullName: string | null;
  email: string | null;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  part1Score: number;
  part2Score: number;
  totalScore: number;
  passed: boolean;
}
export interface AdminStats {
  participants: number;
  attempts: number;
  completed: number;
  passed: number;
  avgScore: number;
  activeQuestions: number;
  passMark: number;
}
export interface ResultDetail {
  attemptId: string;
  accessCode: string;
  label: string | null;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  part1: Record<string, string>;
  part1Fields: Part1FieldDef[];
  part1Score: number;
  part2Score: number;
  totalScore: number;
  correctCount: number;
  totalQuestions: number;
  passMark: number;
  passed: boolean;
  questions: {
    topic: string;
    title: string | null;
    stem: string;
    options: string[];
    competency: string | null;
    isCaseStudy: boolean;
    chosenIndex: number | null;
    correctIndex: number;
    correct: boolean;
  }[];
}

export interface AdminQuestion {
  id: string;
  topic: string;
  title: string | null;
  stem: string;
  options: string[];
  correctIndex: number;
  competency: string | null;
  isCaseStudy: boolean;
  active: boolean;
}
export interface QuestionInput {
  topic: string;
  title?: string;
  stem: string;
  options: string[];
  correctIndex: number;
  competency?: string;
  isCaseStudy?: boolean;
  active?: boolean;
}

export const adminApi = {
  login: (username: string, password: string) =>
    req<{ token: string; admin: { id: string; username: string } }>('/assessment/admin/login', {
      method: 'POST',
      body: { username, password },
    }),
  stats: () => req<AdminStats>('/assessment/admin/stats', { token: adminToken.get() }),
  results: () => req<ResultRow[]>('/assessment/admin/results', { token: adminToken.get() }),
  result: (attemptId: string) =>
    req<ResultDetail>(`/assessment/admin/results/${attemptId}`, { token: adminToken.get() }),
  createParticipants: (payload: { count?: number; labels?: string[] }) =>
    req<{ created: { accessCode: string; label: string | null }[] }>('/assessment/admin/participants', {
      method: 'POST',
      body: payload,
      token: adminToken.get(),
    }),
  listQuestions: () => req<AdminQuestion[]>('/assessment/admin/questions', { token: adminToken.get() }),
  createQuestion: (q: QuestionInput) =>
    req<{ id: string }>('/assessment/admin/questions', { method: 'POST', body: q, token: adminToken.get() }),
  updateQuestion: (id: string, q: QuestionInput) =>
    req<{ ok: boolean }>(`/assessment/admin/questions/${id}`, { method: 'PATCH', body: q, token: adminToken.get() }),
  setQuestionActive: (id: string, active: boolean) =>
    req<{ ok: boolean }>(`/assessment/admin/questions/${id}/active`, {
      method: 'POST',
      body: { active },
      token: adminToken.get(),
    }),
};

export const TOPIC_LABEL: Record<string, string> = {
  EXCEL: 'Excel',
  WORD: 'Word',
  CYBERSECURITY: 'Cybersecurity',
  TAX: 'Tax System & Controls',
};

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
