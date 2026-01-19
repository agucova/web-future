<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { uiState, closeSheet } from '$lib/exiliada/state.svelte';
  import { poemInfo } from '$lib/exiliada/data';

  let isOpen = $derived(uiState.activeSheet === 'info');

  function handleOpenChange(open: boolean) {
    if (!open) {
      closeSheet();
    }
  }
</script>

<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="info-modal-overlay" />
    <Dialog.Content class="info-modal-content">
      <div class="info-modal-inner">
        <Dialog.Close class="info-modal-close" aria-label="Cerrar">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15 5L5 15M5 5L15 15"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </Dialog.Close>

        <div class="modal-header">
          <Dialog.Title class="modal-title">{poemInfo.title}</Dialog.Title>
        </div>

        <Dialog.Description class="modal-body">
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
        </Dialog.Description>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.info-modal-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(44, 36, 22, 0.5);
    backdrop-filter: blur(4px);
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

  :global(.info-modal-content) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 680px;
    width: 90vw;
    max-height: 85vh;
    background: var(--color-parchment);
    border-radius: 8px;
    box-shadow:
      0 20px 60px rgba(44, 36, 22, 0.25),
      0 8px 24px rgba(44, 36, 22, 0.15);
    z-index: 10000;
    animation: scaleIn 0.2s ease-out;
    overflow: hidden;
    outline: none;
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .info-modal-inner {
    position: relative;
    padding: 2rem 3rem 3rem;
    max-height: 85vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: rgba(92, 74, 61, 0.3) transparent;
  }

  /* Custom scrollbar for webkit browsers */
  .info-modal-inner::-webkit-scrollbar {
    width: 6px;
  }

  .info-modal-inner::-webkit-scrollbar-track {
    background: transparent;
  }

  .info-modal-inner::-webkit-scrollbar-thumb {
    background: rgba(92, 74, 61, 0.25);
    border-radius: 3px;
    transition: background 0.2s ease;
  }

  .info-modal-inner::-webkit-scrollbar-thumb:hover {
    background: rgba(92, 74, 61, 0.5);
  }

  .info-modal-inner::-webkit-scrollbar-thumb:active {
    background: rgba(92, 74, 61, 0.7);
  }

  :global(.info-modal-close) {
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-earth);
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    opacity: 0.7;
    z-index: 1;
  }

  :global(.info-modal-close:hover) {
    background: var(--color-parchment-dark);
    color: var(--color-ink);
    opacity: 1;
  }

  :global(.info-modal-close:active) {
    transform: scale(0.95);
  }

  .modal-header {
    margin-bottom: 1.25rem;
    padding-right: 2rem;
  }

  :global(.modal-title) {
    font-family: var(--font-cormorant);
    font-size: 2rem;
    font-weight: 500;
    color: var(--color-ink);
    margin: 0;
    line-height: 1.2;
    letter-spacing: 0.02em;
  }

  :global(.modal-body) {
    font-family: var(--font-source-serif);
    font-size: 1rem;
    line-height: 1.7;
    color: var(--color-ink-light);
  }

  :global(.modal-body .poem-image) {
    float: right;
    width: 180px;
    margin: 0 0 1rem 1.5rem;
    border-radius: 4px;
    box-shadow:
      0 2px 8px rgba(44, 36, 22, 0.15),
      0 0 0 1px rgba(44, 36, 22, 0.08);
  }

  :global(.modal-body p) {
    margin-bottom: 1.25rem;
  }

  :global(.modal-body p + p) {
    text-indent: 1.5em;
  }

  :global(.modal-body p:last-child) {
    margin-bottom: 0;
  }

  :global(.modal-body em) {
    font-style: italic;
    color: var(--color-gold);
    font-weight: 500;
  }

  :global(.modal-body a) {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(181, 134, 67, 0.3);
    transition: all 0.2s ease;
  }

  :global(.modal-body a:hover) {
    color: var(--color-ink);
    border-bottom-color: var(--color-gold);
  }

  :global(.modal-body a:active) {
    opacity: 0.7;
  }

  /* Responsive adjustments */
  @media (max-width: 800px) {
    :global(.info-modal-content) {
      max-width: 95vw;
      width: 95vw;
      max-height: 90vh;
    }

    .info-modal-inner {
      padding: 2rem 1.75rem 2.5rem;
    }

    :global(.info-modal-close) {
      top: 1rem;
      right: 1rem;
    }

    .modal-header {
      margin-bottom: 1rem;
      padding-right: 2.5rem;
    }

    :global(.modal-title) {
      font-size: 1.6rem;
    }

    :global(.modal-body) {
      font-size: 0.95rem;
      line-height: 1.65;
    }

    :global(.modal-body p) {
      margin-bottom: 1rem;
    }

    :global(.modal-body p + p) {
      text-indent: 1.25em;
    }
  }

  /* Extra small screens */
  @media (max-width: 400px) {
    .info-modal-inner {
      padding: 1.5rem 1.25rem 2rem;
    }

    :global(.modal-title) {
      font-size: 1.4rem;
    }

    :global(.modal-body) {
      font-size: 0.9rem;
    }
  }
</style>
