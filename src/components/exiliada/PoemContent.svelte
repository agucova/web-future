<script lang="ts">
  import Stanza from './Stanza.svelte';
  import { stanzas } from '$lib/exiliada/data';
  import type { WordImageUrls } from '$lib/exiliada/types';

  interface Props {
    onShowPlace?: (key: string) => void;
    wordImageUrls: WordImageUrls;
  }

  let { onShowPlace, wordImageUrls }: Props = $props();
</script>

<main class="poem-main">
  <div class="poem-content">
    {#each stanzas as stanza}
      <Stanza
        number={stanza.number}
        lines={stanza.lines}
        {onShowPlace}
        {wordImageUrls}
      />
    {/each}
  </div>
</main>

<style>
  .poem-main {
    grid-column: 1;
    grid-row: 2 / 4;
    background: var(--color-parchment);
    border-right: 1px solid rgba(44, 36, 22, 0.12);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .poem-content {
    flex: 1;
    padding: 1.25rem 1.25rem 1.25rem 2.5rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(139, 69, 19, 0.2) transparent;
  }

  /* Webkit scrollbar styling */
  .poem-content::-webkit-scrollbar {
    width: 8px;
  }

  .poem-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .poem-content::-webkit-scrollbar-thumb {
    background: rgba(139, 69, 19, 0.2);
    border-radius: 4px;
    transition: background 0.2s;
  }

  .poem-content::-webkit-scrollbar-thumb:hover {
    background: rgba(139, 69, 19, 0.35);
  }

  @media (max-width: 800px) {
    .poem-main {
      grid-column: unset;
      grid-row: unset;
      flex: 1;
      border-right: none;
    }

    .poem-content {
      padding: 1rem 1rem 1rem 1rem;
      overflow: visible;
    }
  }
</style>
