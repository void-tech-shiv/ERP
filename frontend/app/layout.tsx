import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Attendly — LTPS Attendance',
  description: 'Independent KL University LTPS attendance calculator prototype. Demo only.'
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
