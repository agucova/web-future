<script lang="ts">
  import { onMount } from 'svelte';
  import { Tooltip } from 'bits-ui';
  import PoemHeader from './PoemHeader.svelte';
  import AudioPlayer from './AudioPlayer.svelte';
  import MapPanel from './MapPanel.svelte';
  import MobilePlaceBar from './MobilePlaceBar.svelte';
  import PoemContent from './PoemContent.svelte';
  import PlaceSidebar from './PlaceSidebar.svelte';
  import BottomSheetManager from './BottomSheet/Manager.svelte';
  import ImageLightbox from './ImageLightbox.svelte';
  import { places, placeTimings } from '$lib/exiliada/data';
  import {
    navigationState,
    uiState,
    setIsMobile,
    setCurrentPlace,
    setCurrentStanza,
    openPlaceSheet,
  } from '$lib/exiliada/state.svelte';
  import { checkIsMobile, debounce } from '$lib/exiliada/utils';
  import type { PlaceImageUrls, WordImageUrls } from '$lib/exiliada/types';

  interface Props {
    imageUrls: PlaceImageUrls;
    imageUrlsLarge?: PlaceImageUrls;
    wordImageUrls: WordImageUrls;
  }

  let { imageUrls, imageUrlsLarge, wordImageUrls }: Props = $props();

  // FIX: Reactive isMobile with resize listener
  onMount(() => {
    setIsMobile(checkIsMobile());

    const handleResize = debounce(() => {
      setIsMobile(checkIsMobile());
    }, 100);

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  // Handle playback time updates to sync places and stanzas
  function handleTimeUpdate(positionMs: number) {
    // Find current place based on position
    let newPlaceIndex = -1;
    for (let i = placeTimings.length - 1; i >= 0; i--) {
      if (positionMs >= placeTimings[i][0]) {
        newPlaceIndex = i;
        break;
      }
    }

    // Update place if changed
    if (newPlaceIndex !== navigationState.currentPlaceIndex && newPlaceIndex >= 0) {
      navigationState.currentPlaceIndex = newPlaceIndex;
      const [, placeKey, stanzaNum] = placeTimings[newPlaceIndex];

      // Only auto-sync if user isn't manually interacting
      if (!navigationState.isUserInteracting) {
        const prevStanza = navigationState.currentStanza;
        setCurrentPlace(placeKey, stanzaNum);

        // Auto-scroll stanza into view (check BEFORE we update stanza)
        if (stanzaNum !== prevStanza) {
          const stanzaEl = document.querySelector(`[data-stanza="${stanzaNum}"]`);
          if (stanzaEl) {
            stanzaEl.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }
        }
      }
    }
  }

  // Handle place clicks from poem or map
  function handleShowPlace(key: string) {
    const place = places[key];
    if (!place) return;

    setCurrentPlace(key);

    if (uiState.isMobile) {
      openPlaceSheet(key, place);
    }
  }
</script>

<Tooltip.Provider>
  <div class="main-container exiliada-base">
    <!-- Sticky header (mobile) / grid layout (desktop) -->
    <header class="sticky-header">
      <PoemHeader />
      <AudioPlayer onTimeUpdate={handleTimeUpdate} />
      <MapPanel onPlaceClick={handleShowPlace} />
      <MobilePlaceBar />
    </header>

    <!-- Desktop sidebar -->
    <PlaceSidebar {imageUrls} {imageUrlsLarge} />

    <!-- Main poem content -->
    <PoemContent onShowPlace={handleShowPlace} {wordImageUrls} />
  </div>

  <!-- Mobile bottom sheets -->
  <BottomSheetManager {imageUrls} {wordImageUrls} />

  <!-- Image lightbox (desktop) -->
  <ImageLightbox />
</Tooltip.Provider>

<style>
  /* Base reset */
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    height: 100vh;
    overflow: hidden;
  }

  .exiliada-base {
    font-family: var(--font-cormorant);
    background: var(--color-parchment);
    color: var(--color-ink);
    line-height: 1.6;
  }

  /* Desktop layout: 2-column grid */
  .main-container {
    display: grid;
    grid-template-columns: 340px 1fr;
    grid-template-rows: auto auto 1fr;
    height: 100vh;
  }

  /* Desktop: sticky-header uses display: contents so children participate in grid */
  .sticky-header {
    display: contents;
  }

  /* Responsive - Mobile */
  @media (max-width: 800px) {
    :global(body) {
      overflow-x: hidden;
      overflow-y: auto;
      height: auto;
    }

    .main-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    /* Single sticky wrapper */
    .sticky-header {
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--color-parchment);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .sticky-header > :global(*) {
      flex-shrink: 0;
    }
  }
</style>
