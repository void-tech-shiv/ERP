import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Attendly — Your Attendance, Simplified',
  description: 'A student-built LTPS attendance workspace with secure ERP access, subject insights and weighted attendance planning.',
  robots: { index: false, follow: false },
};

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
