import type { MetadataRoute } from 'next';
import { APP_NAME, APP_TAGLINE } from '@/lib/appName';

// Web app manifest — makes the console installable as a standalone desktop /
// home-screen app. Icons are the files already in app/ (icon.png, favicon.ico).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — ${APP_TAGLINE}`,
    short_name: APP_NAME,
    description: 'Cross-reference declared income against §29 financial-institution reporting to support tax assessment.',
    // Open the installed app on the staff sign-in page ('/' redirects there anyway).
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    theme_color: '#0c1322',
    background_color: '#f2f6f6',
    icons: [
      { src: '/icon.png', sizes: '256x256', type: 'image/png' },
      { src: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
    ],
  };
}
