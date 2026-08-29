/// <reference types="astro/client" />

interface Window {
  /** Cloudflare Turnstile API, provided by https://challenges.cloudflare.com/turnstile/v0/api.js */
  turnstile?: {
    reset: (widget?: string | HTMLElement) => void;
  };
}
