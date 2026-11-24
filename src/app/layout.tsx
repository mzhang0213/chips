import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Figtree } from 'next/font/google';
import './globals.css';

const figtree = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-figtree' });
const shoulders = Big_Shoulders({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-shoulders' });

export const metadata: Metadata = {
  title: 'Chip tracker',
  appleWebApp: { capable: true, title: 'Chips', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${shoulders.variable}`}>
      <body>{children}</body>
    </html>
  );
}
