<script lang="ts">
  import { Drawer } from 'vaul-svelte';
  import { uiState, closeSheet } from '$lib/exiliada/state.svelte';
  import { formatCoords } from '$lib/exiliada/utils';
  import type { PlaceImageUrls } from '$lib/exiliada/types';

  interface Props {
    imageUrls: PlaceImageUrls;
  }

  let { imageUrls }: Props = $props();

  let place = $derived(uiState.sheetPlace);
  let placeKey = $derived(uiState.sheetPlaceKey);

  // Local open state synced with global
  let open = $state(false);

  // Sync from global to local
  $effect(() => {
    open = uiState.activeSheet === 'place';
  });

  // Sync from local to global (on close)
  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && uiState.activeSheet === 'place') {
      closeSheet();
    }
  }
</script>

<Drawer.Root bind:open onOpenChange={handleOpenChange}>
  <Drawer.Portal>
    <Drawer.Overlay class="sheet-overlay" />
    <Drawer.Content class="sheet-content">
      <div class="sheet-handle"></div>

      {#if place}
        <div class="sheet-header">
          <div class="place-title-row">
            <h3>{place.name}</h3>
            <span class="fragment">— {place.fragment}</span>
          </div>
          <span class="coords">{formatCoords(place.coords)}</span>
        </div>

        <p class="description">{@html place.description}</p>

        {#if placeKey && imageUrls[placeKey]}
          <div class="image-container">
            <img src={imageUrls[placeKey]} alt={place.name} />
          </div>
        {/if}
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

  .sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .place-title-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
  }

  h3 {
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--color-ink);
    font-family: var(--font-cormorant);
    margin: 0;
  }

  .fragment {
    font-family: var(--font-cormorant);
    font-style: italic;
    color: var(--color-blood);
    font-size: 0.875rem;
  }

  .coords {
    font-family: var(--font-source-serif);
    font-size: 0.75rem;
    color: var(--color-earth);
    opacity: 0.7;
    white-space: nowrap;
    padding-top: 0.25rem;
  }

  .description {
    font-size: 0.875rem;
    color: var(--color-ink-light);
    line-height: 1.6;
    font-family: var(--font-source-serif);
    margin: 0;
  }

  .description :global(a) {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(181, 134, 67, 0.3);
    transition: all 0.2s ease;
  }

  .description :global(a:hover) {
    color: var(--color-ink);
    border-bottom-color: var(--color-gold);
  }

  .description :global(a:active) {
    opacity: 0.7;
  }

  .image-container {
    margin-top: 0.75rem;
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .image-container img {
    width: 100%;
    height: auto;
    max-height: 50vw;
    object-fit: cover;
  }
</style>
