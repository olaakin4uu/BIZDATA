export const dynamic = 'force-dynamic';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import BrandProvider from '@/components/BrandProvider';

// Self-hosted Inter (variable) — institutional, highly legible, strong tabular
// numerics for financial data. Served from our own origin; no runtime CDN.
const inter = localFont({
  src: [
    { path: './fonts/InterVariable.woff2', style: 'normal' },
    { path: './fonts/InterVariable-Italic.woff2', style: 'italic' },
  ],
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'FinData — Financial-Institution Data Intelligence',
  description: 'Cross-reference declared income against §29 financial-institution reporting to support tax assessment.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full bg-[var(--canvas)] text-[var(--ink)] font-sans">
        <BrandProvider />
        {children}
      </body>
    </html>
  );
}
