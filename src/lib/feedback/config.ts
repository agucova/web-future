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
 * Cloudflare Turnstile site key rendered on the form page.
 *
 * TEST-ONLY: this is Cloudflare's dummy "visible, always passes" widget site
 * key. It works on any domain but provides no bot protection. Replace with
 * the real site key after creating the Turnstile widget (see DEPLOY.md).
 */
export const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
