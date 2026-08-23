<!--
  Liveness line for the site redesign: what is playing on Spotify right now,
  or the last thing that played.

  Not mounted anywhere yet. The markup and copy below are placeholders that
  exist to exercise GET /api/now-playing; the final wording and styling land
  with the redesign.

  The endpoint always answers 200, either with a track or with
  `{ playing: false }`, so the only thing to handle here is "nothing to show",
  which renders nothing at all.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  interface NowPlayingData {
    playing: boolean;
    track?: string;
    artist?: string;
    album?: string;
    url?: string;
    playedAt?: string;
  }

  let data = $state<NowPlayingData | null>(null);

  onMount(async () => {
    try {
      const response = await fetch('/api/now-playing');
      if (!response.ok) return;
      const payload = (await response.json()) as NowPlayingData;
      if (typeof payload.track === 'string' && typeof payload.url === 'string') {
        data = payload;
      }
    } catch {
      // Decorative: if the endpoint is unreachable, show nothing.
    }
  });

  let label = $derived(data?.playing === true ? 'Listening to' : 'Last played');
</script>

{#if data !== null}
  <p class="now-playing">
    <span class="label">{label}</span>
    <a href={data.url} rel="noopener noreferrer" target="_blank">{data.track}</a>
    {#if data.artist}
      <span class="artist">by {data.artist}</span>
    {/if}
  </p>
{/if}

<style>
  .now-playing {
    font-size: 0.9rem;
    margin: 0;
  }

  .label,
  .artist {
    opacity: 0.75;
  }
</style>
