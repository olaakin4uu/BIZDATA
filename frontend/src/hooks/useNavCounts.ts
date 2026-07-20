'use client';
import { useEffect, useState } from 'react';
import { notificationsApi } from '@/lib/api/notifications';
import { providersApi } from '@/lib/api/providers';

export interface NavCounts {
  /** Unread notifications — badges the Alerts item and the topbar bell. */
  unreadAlerts?: number;
  /** Onboarded providers — badges the Data Providers item. */
  providers?: number;
}

/** Lightweight counts for nav badges + the topbar bell. Fails silently — a badge
 *  is decoration, it must never block or error the shell. */
export function useNavCounts(): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({});

  useEffect(() => {
    let alive = true;
    notificationsApi
      .list()
      .then((n) => alive && setCounts((c) => ({ ...c, unreadAlerts: n.filter((x) => !x.read).length })))
      .catch(() => {});
    providersApi
      .stats()
      .then((s) => alive && setCounts((c) => ({ ...c, providers: s.total })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return counts;
}
