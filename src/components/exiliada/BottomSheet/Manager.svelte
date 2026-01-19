<script lang="ts">
  import PlaceSheet from './PlaceSheet.svelte';
  import WordSheet from './WordSheet.svelte';
  import InfoSheet from './InfoSheet.svelte';
  import InfoModal from '../InfoModal.svelte';
  import { uiState } from '$lib/exiliada/state.svelte';
  import type { PlaceImageUrls, WordImageUrls } from '$lib/exiliada/types';

  interface Props {
    imageUrls: PlaceImageUrls;
    wordImageUrls: WordImageUrls;
  }

  let { imageUrls, wordImageUrls }: Props = $props();
</script>

<!-- Mobile: Bottom sheets -->
{#if uiState.isMobile}
  <PlaceSheet {imageUrls} />
  <WordSheet />
  <InfoSheet />
{:else}
  <!-- Desktop: Modal for info -->
  <InfoModal />
{/if}
