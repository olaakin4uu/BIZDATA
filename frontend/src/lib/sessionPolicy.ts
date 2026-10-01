// Idle sign-out policy — one place for every signed-in area (staff console,
// provider portal, assessment administration). See hooks/useIdleTimeout.ts for
// how it is enforced.

/** Inactivity before the "still there?" warning appears. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
/** Countdown shown in the warning before sign-out. */
export const IDLE_WARNING_MS = 60 * 1000;
/** Total idle time after which the session is over. */
export const IDLE_LIMIT_MS = IDLE_TIMEOUT_MS + IDLE_WARNING_MS;

/** localStorage keys for the last-activity time, one per signed-in area. */
export const STAFF_IDLE_KEY = 'idle.staff.lastActivity';
export const PROVIDER_IDLE_KEY = 'idle.provider.lastActivity';
export const ASSESSMENT_ADMIN_IDLE_KEY = 'idle.assessmentAdmin.lastActivity';
