<!--
  Which city Agus has published.

  The important thing about this component is where it gets its answer.
  `/api/where` is asked only whether the site is currently disclosing a
  location; the location itself is resolved here, in the visitor's browser,
  by querying public DNS-over-HTTPS resolvers directly. DNS-over-HTTPS is
  ordinary HTTPS and the public resolvers allow cross-origin reads, so the
  page can make its own DNS query and never take this site's word for what
  the record says.

  That split is deliberate:

    - The gate is a server question. Whether the site is saying anything at
      all lives in KV, fails closed, and cannot be evaluated client side. If
      the endpoint does not say `disclosed: true`, this renders nothing, no
      matter what DNS contains.
    - The claim is a DNS question. Reading it here removes the site's cache
      from between the record and the reader, which is the whole premise of
      publishing it in DNS in the first place.

  Two resolvers are asked rather than one. That is not a proof, and the
  component says so: a resolver is still a third party that can answer with
  whatever it likes. What it buys is that a lie has to be told twice, by two
  unrelated operators, to go unnoticed, and that ordinary propagation shows
  up as a visible disagreement instead of a silent coin flip.

  Everything user-facing below is a PLACEHOLDER for Agus to rewrite. Two
  behaviours must survive any rewrite: exactly one silent state with no
  explanation attached, and the check shown next to the claim.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { RESOLVERS, type WhereDisclosed, resolveAcross } from '../lib/where/doh';

  interface Verification {
    /** Resolvers that answered at all. */
    answered: string[];
    /** They answered, and said the same thing. */
    agreed: boolean;
    /** They answered, and did not. */
    disagreed: boolean;
    /** Every answering resolver reported a validated DNSSEC chain. */
    authenticated: boolean;
  }

  let data = $state<WhereDisclosed | null>(null);
  let verification = $state<Verification | null>(null);

  onMount(async () => {
    // The gate, and only the gate. A `disclosed: false` here is final.
    let gate: WhereDisclosed | null = null;
    try {
      const response = await fetch('/api/where');
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.disclosed !== true || typeof payload.name !== 'string') return;
      gate = payload as WhereDisclosed;
    } catch {
      // Decorative: if the gate is unreachable, show nothing.
      return;
    }

    // The claim, resolved here rather than taken from the response above.
    try {
      const consensus = await resolveAcross(gate.name, fetch, Date.now());
      const answered = consensus.outcomes
        .filter((outcome) => outcome.response !== null)
        .map((outcome) => outcome.resolver.label);

      if (consensus.agreed && consensus.answer?.disclosed === true) {
        data = consensus.answer;
        verification = {
          answered,
          agreed: true,
          disagreed: false,
          authenticated: consensus.authenticated,
        };
        return;
      }

      // Resolvers were reachable but did not agree, or agreed that nothing is
      // published while the site says otherwise. Either way the honest thing
      // is to show the disagreement rather than pick a winner.
      if (consensus.usable > 0) {
        data = gate;
        verification = { answered, agreed: false, disagreed: true, authenticated: false };
        return;
      }
    } catch {
      // Fall through to the unverified path.
    }

    // No resolver could be reached, so the claim is this site's word alone.
    data = gate;
    verification = null;
  });

  let precision = $derived(
    data?.precisionMetres === undefined ? '' : `${Math.round(data.precisionMetres / 1000)} km`,
  );
  let resolverNames = $derived(RESOLVERS.map((resolver) => resolver.label).join(' and '));
</script>

{#if data !== null}
  <p class="where-city">
    <!-- PLACEHOLDER copy -->
    <span class="label">Currently in</span>
    <strong>{data.city}</strong><span class="country">, {data.country}</span>
  </p>

  <p class="where-terms">
    <!-- PLACEHOLDER copy -->
    Published {data.since}, claimed until {data.until}, to about {precision}.
  </p>

  <pre><code>dig LOC {data.name}
{data.name}. IN LOC {data.loc}</code></pre>

  <!-- PLACEHOLDER copy -->
  <p class="where-check">
    {#if verification === null}
      Your browser could not reach a DNS resolver, so the line above is this
      site's word rather than something it checked. Run the command.
    {:else if verification.disagreed}
      {resolverNames} were asked for this record directly and gave different
      answers, which usually means a change is still propagating. Run the
      command yourself.
    {:else}
      Read from DNS by your own browser, asking {verification.answered.join(' and ')} directly.
      This site was asked whether to show a location, not what it is.
      {#if verification.authenticated}
        Both answers came with a validated DNSSEC chain.
      {:else}
        Neither answer is DNSSEC validated yet, so it rests on trusting the resolvers.
      {/if}
    {/if}
  </p>
{/if}

<style>
  .label,
  .country,
  .where-terms,
  .where-check {
    opacity: 0.75;
  }

  .where-terms,
  .where-check {
    font-size: 0.9rem;
  }

  pre code {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
