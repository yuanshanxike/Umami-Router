'use client';

import { usePathname } from 'next/navigation';
import { useUmami, usePageviewTracking, useEventTracking } from '@umami_router/sdk';
import type { NextjsTrackerOptions } from '@umami_router/sdk';

interface TrackerProviderProps {
  children: React.ReactNode;
  options: NextjsTrackerOptions;
}

export function TrackerProvider({ children, options }: TrackerProviderProps) {
  const pathname = usePathname();

  // Initialize useUmami hook with options
  const { tracker, isReady, enableAutoTrack, disableAutoTrack, isAutoTrackEnabled, track } =
    useUmami(options);

  // Auto track pageviews
  usePageviewTracking(() => pathname);

  // Expose event tracking
  useEventTracking();

  return (
    <>
      {children}
      <TrackerDebug
        isReady={isReady}
        isAutoTrackEnabled={isAutoTrackEnabled()}
        enableAutoTrack={enableAutoTrack}
        disableAutoTrack={disableAutoTrack}
        trackPageview={track.pageview}
        trackEvent={track.event}
      />
    </>
  );
}

interface TrackerDebugProps {
  isReady: boolean;
  isAutoTrackEnabled: boolean;
  enableAutoTrack: () => void;
  disableAutoTrack: () => void;
  trackPageview: (url: string, referrer?: string) => Promise<void>;
  trackEvent: (name: string, data?: Record<string, unknown>) => Promise<void>;
}

function TrackerDebug({
  isReady,
  isAutoTrackEnabled,
  enableAutoTrack,
  disableAutoTrack,
  trackPageview,
  trackEvent,
}: TrackerDebugProps) {
  const handleTrackEvent = async () => {
    await trackEvent('demo_button_click', { page: 'debug_panel' });
    alert('Event tracked! Check your Umami dashboard.');
  };

  const handleTrackPageview = async () => {
    await trackPageview('/manual-pageview', window.location.pathname);
    alert('Pageview tracked!');
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        background: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '1rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        maxWidth: '300px',
        fontSize: '0.875rem',
      }}
    >
      <h3 style={{ marginBottom: '0.5rem' }}>Umami Tracker</h3>
      <p>
        Status:{' '}
        <span className={`status ${isReady ? 'ready' : 'pending'}`}>
          {isReady ? 'Ready' : 'Initializing...'}
        </span>
      </p>
      <p>
        Auto-track:{' '}
        <span className={`status ${isAutoTrackEnabled ? 'ready' : 'pending'}`}>
          {isAutoTrackEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </p>
      <div style={{ marginTop: '0.5rem' }}>
        <button onClick={enableAutoTrack} disabled={isAutoTrackEnabled}>
          Enable Auto-track
        </button>
        <button onClick={disableAutoTrack} disabled={!isAutoTrackEnabled}>
          Disable Auto-track
        </button>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <button onClick={handleTrackPageview}>Track Pageview</button>
        <button onClick={handleTrackEvent}>Track Event</button>
      </div>
    </div>
  );
}
