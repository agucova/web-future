<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { uiState, closeLightbox } from '$lib/exiliada/state.svelte';

  function handleOpenChange(open: boolean) {
    if (!open) {
      closeLightbox();
    }
  }
</script>

<Dialog.Root open={uiState.lightboxOpen} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="lightbox-overlay" />
    <Dialog.Content class="lightbox-content">
      <Dialog.Close class="lightbox-close" aria-label="Cerrar">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18 6L6 18M6 6L18 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </Dialog.Close>

      {#if uiState.lightboxImageUrl}
        <img
          src={uiState.lightboxImageUrl}
          alt={uiState.lightboxAlt}
          class="lightbox-image"
        />
        {#if uiState.lightboxAlt}
          <Dialog.Description class="lightbox-caption">
            {uiState.lightboxAlt}
          </Dialog.Description>
        {/if}
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.lightbox-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 9999;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  :global(.lightbox-content) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 90vw;
    max-height: 90vh;
    z-index: 10000;
    animation: scaleIn 0.2s ease-out;
    outline: none;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  :global(.lightbox-close) {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    z-index: 10001;
  }

  :global(.lightbox-close:hover) {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  :global(.lightbox-close:active) {
    transform: scale(0.95);
  }

  .lightbox-image {
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  :global(.lightbox-caption) {
    margin-top: 1rem;
    font-family: var(--font-cormorant);
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.9);
    text-align: center;
    max-width: 600px;
  }
</style>
