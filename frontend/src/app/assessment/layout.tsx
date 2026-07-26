import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FinData Aptitude Test',
  description: 'Timed aptitude assessment — Excel, Word and Cybersecurity.',
};

// Self-contained shell. The root layout already provides <html>/<body>, fonts
// and theme tokens; this platform runs OUTSIDE the (staff)/(provider) groups so
// it inherits none of their navigation or auth.
export default function AssessmentLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
