import { NotificationsService } from './notifications.service';
import { ProviderPortalService } from '../provider-portal/provider-portal.service';

/**
 * Staff ↔ provider notification separation.
 *
 * Provider-addressed notifications (SUBMISSION_OVERDUE, RESUBMIT_PERMISSION) are
 * written with targetRole = null and targetUserId = null, which is exactly the
 * shape of a staff broadcast. Before the gate, every one of them surfaced in the
 * officer alert feed at /notifications — and nowhere else, since providers had no
 * notifications surface at all. These tests pin both directions shut.
 */

interface Row {
  id: string;
  targetRole: string | null;
  targetUserId: string | null;
  targetProviderId: string | null;
  read: boolean;
}

const ROWS: Row[] = [
  { id: 'svc-broadcast',   targetRole: null,         targetUserId: null,      targetProviderId: null,     read: false },
  { id: 'svc-role',        targetRole: 'SUPERVISOR', targetUserId: null,      targetProviderId: null,     read: false },
  { id: 'svc-mine',        targetRole: null,         targetUserId: 'staff-1', targetProviderId: null,     read: false },
  { id: 'svc-other-staff', targetRole: null,         targetUserId: 'staff-2', targetProviderId: null,     read: false },
  { id: 'prov-a-overdue',  targetRole: null,         targetUserId: null,      targetProviderId: 'prov-A', read: false },
  { id: 'prov-a-read',     targetRole: null,         targetUserId: null,      targetProviderId: 'prov-A', read: true },
  { id: 'prov-b-overdue',  targetRole: null,         targetUserId: null,      targetProviderId: 'prov-B', read: false },
];

/** Evaluates the subset of Prisma `where` syntax these two services actually use. */
function matches(row: Row, where: any): boolean {
  for (const key of ['id', 'targetProviderId', 'read'] as const) {
    if (key in where && (row as any)[key] !== where[key]) return false;
  }
  if (where.OR) {
    return where.OR.some((clause: any) =>
      Object.entries(clause).every(([k, v]) => (row as any)[k] === v),
    );
  }
  return true;
}

const updated: string[] = [];
const prisma: any = {
  notification: {
    findMany: async ({ where }: any) => ROWS.filter((r) => matches(r, where)),
    findFirst: async ({ where }: any) => ROWS.find((r) => matches(r, where)) ?? null,
    count: async ({ where }: any) => ROWS.filter((r) => matches(r, where)).length,
    update: async ({ where }: any) => { updated.push(where.id); return where.id; },
  },
};

const staff = new NotificationsService(prisma);
const portal = new ProviderPortalService(prisma, null as any, null as any, null as any);

beforeEach(() => { updated.length = 0; });

describe('staff feed excludes provider-addressed notifications', () => {
  it('never returns a provider notification, even though it looks like a broadcast', async () => {
    const ids = (await staff.list('staff-1', 'SUPERVISOR')).map((n: any) => n.id);
    expect(ids).not.toContain('prov-a-overdue');
    expect(ids).not.toContain('prov-b-overdue');
    expect(ids.every((id: string) => id.startsWith('svc-'))).toBe(true);
  });

  it('still returns broadcasts, role-scoped alerts, and the caller’s own', async () => {
    const ids = (await staff.list('staff-1', 'SUPERVISOR')).map((n: any) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['svc-broadcast', 'svc-role', 'svc-mine']));
  });

  it('does not leak another officer’s personal notification', async () => {
    const ids = (await staff.list('staff-1', 'SUPERVISOR')).map((n: any) => n.id);
    expect(ids).not.toContain('svc-other-staff');
  });

  it('hides role-scoped alerts from a different role', async () => {
    const ids = (await staff.list('staff-1', 'ANALYST')).map((n: any) => n.id);
    expect(ids).not.toContain('svc-role');
  });

  it('refuses to mark a provider notification read', async () => {
    await expect(staff.markRead('prov-a-overdue', 'staff-1', 'SUPERVISOR')).rejects.toThrow('not found');
    expect(updated).toEqual([]);
  });

  it('refuses to mark another officer’s notification read', async () => {
    await expect(staff.markRead('svc-other-staff', 'staff-1', 'SUPERVISOR')).rejects.toThrow('not found');
    expect(updated).toEqual([]);
  });

  it('marks a visible service alert read', async () => {
    await staff.markRead('svc-broadcast', 'staff-1', 'SUPERVISOR');
    expect(updated).toEqual(['svc-broadcast']);
  });
});

describe('provider portal returns only that provider’s notifications', () => {
  it('returns its own and nothing from another provider or the service feed', async () => {
    const ids = (await portal.listNotifications('prov-A')).map((n: any) => n.id);
    expect(ids).toEqual(['prov-a-overdue', 'prov-a-read']);
  });

  it('counts only its own unread', async () => {
    expect(await portal.unreadNotificationCount('prov-A')).toBe(1);
    expect(await portal.unreadNotificationCount('prov-B')).toBe(1);
  });

  it('refuses to mark another provider’s notification read', async () => {
    await expect(portal.markNotificationRead('prov-A', 'prov-b-overdue')).rejects.toThrow('not found');
    expect(updated).toEqual([]);
  });

  it('refuses to mark a staff service alert read', async () => {
    await expect(portal.markNotificationRead('prov-A', 'svc-broadcast')).rejects.toThrow('not found');
    expect(updated).toEqual([]);
  });

  it('marks its own notification read', async () => {
    await portal.markNotificationRead('prov-A', 'prov-a-overdue');
    expect(updated).toEqual(['prov-a-overdue']);
  });
});
