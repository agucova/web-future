<script lang="ts">
  import { Tooltip } from 'bits-ui';
  import { wordDefinitions } from '$lib/exiliada/data';
  import { uiState, openWordSheet } from '$lib/exiliada/state.svelte';
  import type { WordImageUrls } from '$lib/exiliada/types';

  interface Props {
    wordKey: string;
    text: string;
    wordImageUrls: WordImageUrls;
  }

  let { wordKey, text, wordImageUrls }: Props = $props();

  // Use $derived to react to wordKey changes
  const definition = $derived(wordDefinitions[wordKey]);

  // Get optimized image URL from props, falling back to definition's static path
  const imageUrl = $derived(wordImageUrls[wordKey] || definition?.image);

  // Controlled tooltip state for click-to-toggle on desktop
  let isOpen = $state(false);

  function handleClick(e: MouseEvent) {
    if (uiState.isMobile && definition) {
      e.preventDefault();
      e.stopPropagation();
      // Pass definition with resolved image URL
      openWordSheet({ ...definition, image: imageUrl });
    } else if (definition) {
      // Desktop: toggle tooltip on click
      isOpen = !isOpen;
    }
  }

  function handleOpenChange(open: boolean) {
    isOpen = open;
  }
</script>

{#if definition}
  {#if !uiState.isMobile}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="word-hint-wrapper" onclick={handleClick}>
      <Tooltip.Root open={isOpen} onOpenChange={handleOpenChange} delayDuration={0}>
        <Tooltip.Trigger class="word-hint-trigger">
          <span class="word-hint">{text}</span>
        </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          class="tooltip-content"
          side="right"
          sideOffset={8}
          collisionPadding={16}
          avoidCollisions={true}
        >
          <div class="tooltip-card" class:has-image={imageUrl}>
            {#if imageUrl}
              <img class="tooltip-image" src={imageUrl} alt={definition.word} />
            {/if}
            <div class="tooltip-text">
              <div class="tooltip-header">
                <span class="tooltip-title">{definition.word}</span>
                <span class="tooltip-origin">{definition.origin}</span>
              </div>
              <div class="tooltip-definition">{definition.definition}</div>
            </div>
          </div>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
    </span>
  {:else}
    <span class="word-hint" onclick={handleClick}>{text}</span>
  {/if}
{:else}
  <span class="word-hint">{text}</span>
{/if}

<style>
  .word-hint-wrapper {
    display: inline;
    cursor: pointer;
  }

  :global(.word-hint-trigger) {
    display: inline;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    cursor: pointer;
  }

  .word-hint {
    color: inherit;
    border-bottom: 1px dotted var(--color-earth);
    cursor: help;
    transition: color 0.2s, border-bottom-color 0.2s;
  }

  .word-hint:hover {
    color: var(--color-gold);
    border-bottom-color: var(--color-gold);
  }

  :global(.tooltip-content) {
    background-color: var(--color-ink);
    color: var(--color-parchment);
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    font-family: var(--font-cormorant);
    z-index: 1000;
    max-width: 380px;
    animation: tooltip-in 0.15s ease-out;
  }

  @keyframes tooltip-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tooltip-card {
    padding: 14px;
  }

  .tooltip-card.has-image {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 14px;
  }

  .tooltip-image {
    width: 80px;
    height: 80px;
    min-width: 80px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .tooltip-text {
    flex: 1;
    min-width: 0;
  }

  .tooltip-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .tooltip-title {
    font-family: var(--font-cormorant);
    font-weight: 600;
    font-size: 1.15rem;
  }

  .tooltip-origin {
    font-style: italic;
    font-size: 0.9rem;
    color: var(--color-gold);
  }

  .tooltip-definition {
    font-family: var(--font-source-serif);
    font-size: 0.95rem;
    line-height: 1.5;
    color: rgba(246, 243, 234, 0.95);
  }
</style>
