<script lang="ts">
  import { Drawer } from 'vaul-svelte';
  import { uiState, closeSheet } from '$lib/exiliada/state.svelte';

  let definition = $derived(uiState.sheetWord);

  // Local open state synced with global
  let open = $state(false);

  // Sync from global to local
  $effect(() => {
    open = uiState.activeSheet === 'word';
  });

  // Sync from local to global (on close)
  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && uiState.activeSheet === 'word') {
      closeSheet();
    }
  }
</script>

<Drawer.Root bind:open onOpenChange={handleOpenChange}>
  <Drawer.Portal>
    <Drawer.Overlay class="sheet-overlay" />
    <Drawer.Content class="sheet-content">
      <div class="sheet-handle"></div>

      {#if definition}
        <div class="word-content">
          {#if definition.image}
            <img src={definition.image} alt={definition.word} class="word-image" />
          {/if}
          <div class="word-text">
            <div class="word-header">
              <span class="word-title">{definition.word}</span>
              <span class="word-origin">{definition.origin}</span>
            </div>
            <p class="word-definition">{definition.definition}</p>
          </div>
        </div>
      {/if}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<style>
  :global(.sheet-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 200;
  }

  :global(.sheet-content) {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 201;
    display: flex;
    flex-direction: column;
    border-radius: 16px 16px 0 0;
    background: var(--color-parchment);
    padding: 0.75rem 1.25rem 1.25rem;
  }

  .sheet-handle {
    width: 2.5rem;
    height: 0.375rem;
    margin: 0 auto 0.75rem;
    border-radius: 9999px;
    background: rgba(44, 36, 22, 0.25);
  }

  .word-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .word-image {
    width: 100%;
    max-height: 40vh;
    object-fit: cover;
    border-radius: 0.5rem;
  }

  .word-text {
    flex: 1;
    min-width: 0;
  }

  .word-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .word-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-ink);
    font-family: var(--font-cormorant);
  }

  .word-origin {
    font-family: var(--font-cormorant);
    font-style: italic;
    font-size: 0.875rem;
    color: var(--color-gold);
  }

  .word-definition {
    font-size: 0.875rem;
    color: var(--color-ink-light);
    line-height: 1.6;
    font-family: var(--font-source-serif);
    margin: 0;
  }
</style>
