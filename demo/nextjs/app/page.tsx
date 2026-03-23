import dynamic from 'next/dynamic';
import Nav from '@/components/Nav';
import TrackedButton from '@/components/TrackedButton';

const TrackerProvider = dynamic(
  () => import('@/components/TrackerProvider').then((mod) => mod.TrackerProvider),
  { ssr: false }
);

// Demo configuration - replace with your actual values
const TRACKER_OPTIONS = {
  websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '',
  proxyPath: process.env.NEXT_PUBLIC_UMAMI_PROXY_PATH ?? '/trpc',
  autoTrack: true,
};

export default function HomePage() {
  return (
    <TrackerProvider options={TRACKER_OPTIONS}>
      <Nav />
      <main>
        <h1>Home Page</h1>
        <p>Welcome to the Umami Router Next.js Demo!</p>

        <div className="demo-section">
          <h2>What is this?</h2>
          <p>
            This demo showcases the <code>@umami_router/sdk</code> integration with Next.js 14
            App Router.
          </p>
        </div>

        <div className="demo-section">
          <h2>Features Demonstrated</h2>
          <ul>
            <li>
              <strong>useUmami() hook</strong> - Core tracking interface
            </li>
            <li>
              <strong>usePageviewTracking()</strong> - Automatic pageview tracking
            </li>
            <li>
              <strong>useEventTracking()</strong> - Custom event tracking
            </li>
            <li>
              <strong>Auto-track toggle</strong> - Enable/disable automatic tracking
            </li>
          </ul>
        </div>

        <div className="demo-section">
          <h2>Configuration</h2>
          <div className="config-info">
            <strong>websiteId:</strong> {TRACKER_OPTIONS.websiteId}
            <br />
            <strong>proxyPath:</strong> {TRACKER_OPTIONS.proxyPath}
            <br />
            <strong>autoTrack:</strong> {TRACKER_OPTIONS.autoTrack ? 'true' : 'false'}
          </div>
        </div>

        <div className="demo-section">
          <h2>Test Event Tracking</h2>
          <p>Click the buttons in the debug panel (bottom-right) to test tracking:</p>
          <ul>
            <li>Manually track a pageview</li>
            <li>Track a custom &quot;demo_button_click&quot; event</li>
            <li>Toggle auto-track on/off</li>
          </ul>
          <div style={{ marginTop: '1rem' }}>
            <TrackedButton />
          </div>
        </div>

        <p style={{ color: '#666', marginTop: '2rem' }}>
          Navigate to <a href="/about">About</a> or <a href="/contact">Contact</a> to see automatic
          pageview tracking in action.
        </p>
      </main>
    </TrackerProvider>
  );
}
