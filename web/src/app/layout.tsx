import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'NightQA',
  description: 'Self-healing QA agent for AI-written software.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Pages read the results folder at request time (see connection()), so they stream inside this boundary. */}
        <Suspense fallback={null}>{children}</Suspense>
      </body>
    </html>
  );
}
