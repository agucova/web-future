/**
 * Shared configuration for the anonymous feedback feature.
 *
 * Everything that must be swapped when the feature goes live is centralized
 * here so there is exactly one place to update.
 */

/**
 * The age recipient (public key) that feedback is encrypted to in the
 * browser, before anything leaves the page. age recipients are public by
 * design, so embedding this in client-side code is safe.
 *
 * The matching decryption secret lives only in 1Password
 * (op://Private/zba2amz2hrfsjc3zbfgq7776zq/age_feedback_key) — see DEPLOY.md.
 */
export const AGE_RECIPIENT =
	"age1jd2nt7k67s4jw4qu0xt8g00ah202uyq9u2cql653yj2gpdfznqvs7c8f6p";

/**
 * Cloudflare Turnstile site key rendered on the form page (site keys are
 * public by design). The widget is mode=managed and valid for agucova.dev
 * and agucova.workers.dev.
 *
 * Local dev note: localhost is not in the widget's domains, so when testing
 * the form against `wrangler dev`, temporarily swap in Cloudflare's dummy
 * always-pass site key "1x00000000000000000000AA" (its matching dummy
 * secret already lives in .dev.vars). Never commit the swap.
 */
export const TURNSTILE_SITE_KEY = "0x4AAAAAAEYyo6jn2FUNqMqR";
