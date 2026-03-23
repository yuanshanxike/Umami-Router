declare module 'next/router' {
  export interface NextRouter {
    asPath: string;
    isReady: boolean;
    events: {
      on(event: 'routeChangeComplete', cb: (url: string) => void): void;
      off(event: 'routeChangeComplete', cb: (url: string) => void): void;
    };
  }

  export function useRouter(): NextRouter;
}
