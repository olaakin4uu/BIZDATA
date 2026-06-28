import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BizData — Multi-Source Data Intelligence',
  description: 'Cross-reference declared income against bank, fintech, telco, and payment provider data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-800 font-sans">{children}</body>
    </html>
  );
}
