<script lang="ts">
  import { Drawer } from 'vaul-svelte';
  import { uiState, closeSheet } from '$lib/exiliada/state.svelte';
  import { poemInfo } from '$lib/exiliada/data';

  // Local open state synced with global
  let open = $state(false);

  // Sync from global to local
  $effect(() => {
    open = uiState.activeSheet === 'info';
  });

  // Sync from local to global (on close)
  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && uiState.activeSheet === 'info') {
      closeSheet();
    }
  }
</script>

<Drawer.Root bind:open onOpenChange={handleOpenChange}>
  <Drawer.Portal>
    <Drawer.Overlay class="sheet-overlay" />
    <Drawer.Content class="sheet-content info-sheet">
      <div class="sheet-handle"></div>

      <div class="info-scroll-area">
        <h3 class="info-title">{poemInfo.title}</h3>

        <div class="info-content">
          {#if poemInfo.imageUrl}
            <img
              src={poemInfo.imageUrl}
              alt={poemInfo.imageAlt}
              class="poem-image"
            />
          {/if}
          {#each poemInfo.paragraphs as paragraph}
            <p>{@html paragraph}</p>
          {/each}
        </div>
      </div>
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

  :global(.info-sheet) {
    max-height: 85vh;
  }

  .sheet-handle {
    width: 2.5rem;
    height: 0.375rem;
    margin: 0 auto 0.75rem;
    border-radius: 9999px;
    background: rgba(44, 36, 22, 0.25);
    flex-shrink: 0;
  }

  .info-scroll-area {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding-bottom: 1rem;
  }

  .info-title {
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--color-ink);
    font-family: var(--font-cormorant);
    margin: 0 0 0.75rem 0;
  }

  .info-content {
    font-size: 0.875rem;
    color: var(--color-ink-light);
    line-height: 1.6;
    font-family: var(--font-source-serif);
  }

  .info-content :global(.poem-image) {
    float: right;
    width: 140px;
    margin: 0 0 0.75rem 1rem;
    border-radius: 4px;
    box-shadow:
      0 2px 8px rgba(44, 36, 22, 0.15),
      0 0 0 1px rgba(44, 36, 22, 0.08);
  }

  .info-content :global(p) {
    margin: 0 0 0.875rem 0;
  }

  .info-content :global(p + p) {
    text-indent: 1.25em;
  }

  .info-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .info-content :global(em) {
    color: var(--color-gold);
    font-style: italic;
    font-weight: 500;
  }

  .info-content :global(a) {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(181, 134, 67, 0.3);
    transition: all 0.2s ease;
  }

  .info-content :global(a:hover) {
    color: var(--color-ink);
    border-bottom-color: var(--color-gold);
  }

  .info-content :global(a:active) {
    opacity: 0.7;
  }
</style>
