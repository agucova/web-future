/// <reference types="astro/client" />

/** SavvyCal embed queue function, provided by https://embed.savvycal.com/v1/embed.js */
interface SavvyCalFn {
  (...args: unknown[]): void;
  q?: IArguments[];
}

declare var SavvyCal: SavvyCalFn;

interface Window {
  SavvyCal?: SavvyCalFn;
  /** Cloudflare Turnstile API, provided by https://challenges.cloudflare.com/turnstile/v0/api.js */
  turnstile?: {
    reset: (widget?: string | HTMLElement) => void;
  };
}
