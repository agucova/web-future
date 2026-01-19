<script lang="ts">
  import { places } from '$lib/exiliada/data';
  import { navigationState, uiState, setCurrentPlace, openPlaceSheet } from '$lib/exiliada/state.svelte';

  interface Props {
    placeKey: string;
    text: string;
    onShowPlace?: (key: string) => void;
  }

  let { placeKey, text, onShowPlace }: Props = $props();

  let isActive = $derived(navigationState.currentPlaceKey === placeKey);

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    const place = places[placeKey];
    if (!place) return;

    setCurrentPlace(placeKey);

    if (uiState.isMobile) {
      openPlaceSheet(placeKey, place);
    }

    onShowPlace?.(placeKey);
  }
</script>

<a
  href="#"
  class="place-link"
  class:active={isActive}
  data-place={placeKey}
  onclick={handleClick}
>{text}</a>

<style>
  .place-link {
    color: var(--color-blood);
    text-decoration: none;
    border-bottom: 1px dotted var(--color-blood);
    cursor: pointer;
    transition: all 0.15s ease-out;
    font-feature-settings: "liga" 1, "calt" 1;
  }

  .place-link:hover {
    color: var(--color-gold);
    border-bottom-color: var(--color-gold);
    letter-spacing: 0.01em;
  }

  .place-link.active {
    color: var(--color-gold);
    border-bottom: 2px solid var(--color-gold);
    font-weight: 500;
    letter-spacing: 0.005em;
  }
</style>
