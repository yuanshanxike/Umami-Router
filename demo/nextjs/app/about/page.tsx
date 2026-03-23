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

export default function AboutPage() {
  return (
    <TrackerProvider options={TRACKER_OPTIONS}>
      <Nav />
      <main>
        <h1>About Page</h1>
        <p>
          This is the About page. The <code>usePageviewTracking</code> hook automatically tracks
          when you navigate here.
        </p>

        <div className="demo-section">
          <h2>How Pageview Tracking Works</h2>
          <p>
            The <code>usePageviewTracking</code> hook monitors the pathname and automatically sends
            a pageview event to Umami when it changes. This happens on the client side as you
            navigate between pages using Next.js App Router.
          </p>
          <p>
            The hook uses React&apos;s <code>usePathname</code> to detect navigation and
            <code> useEffect</code> to trigger tracking on path changes.
          </p>
        </div>

        <div className="demo-section">
          <h2>Tracking Options</h2>
          <p>
            You can customize pageview tracking by passing options to the tracker. The
            auto-track feature is enabled by default and can be toggled at runtime.
          </p>
        </div>
      </main>
    </TrackerProvider>
  );
}
