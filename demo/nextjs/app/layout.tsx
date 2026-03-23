import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Umami Router Demo',
  description: 'Next.js App Router integration with @umami_router/sdk',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
