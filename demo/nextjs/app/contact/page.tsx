import dynamic from 'next/dynamic';
import Nav from '@/components/Nav';

const TrackerProvider = dynamic(
  () => import('@/components/TrackerProvider').then((mod) => mod.TrackerProvider),
  { ssr: false }
);

const TRACKER_OPTIONS = {
  websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '',
  proxyPath: process.env.NEXT_PUBLIC_UMAMI_PROXY_PATH ?? '/trpc',
  autoTrack: true,
};

export default function ContactPage() {
  return (
    <TrackerProvider options={TRACKER_OPTIONS}>
      <Nav />
      <main>
        <h1>Contact Page</h1>
        <p>
          This page demonstrates custom event tracking with form interactions. Notice how the
          debug panel shows the auto-track status.
        </p>

        <div className="demo-section">
          <h2>Custom Events Demo</h2>
          <p>
            Use the <strong>Track Event</strong> button in the debug panel to send a custom event
            to Umami. The <code>useEventTracking</code> hook provides the <code>trackEvent</code>{' '}
            function for this purpose.
          </p>
        </div>

        <div className="demo-section">
          <h2>Tracking Architecture</h2>
          <p>
            The <code>UmamiProvider</code> wrapper initializes the tracker and provides context to
            child components. It combines:
          </p>
          <ul>
            <li><code>useUmami()</code> - Creates and manages the tracker instance</li>
            <li><code>usePageviewTracking()</code> - Enables automatic pageview tracking</li>
            <li><code>useEventTracking()</code> - Provides custom event tracking capability</li>
          </ul>
        </div>
      </main>
    </TrackerProvider>
  );
}
