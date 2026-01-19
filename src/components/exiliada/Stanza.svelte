<script lang="ts">
  import PlaceLink from './PlaceLink.svelte';
  import WordHint from './WordHint.svelte';
  import { navigationState } from '$lib/exiliada/state.svelte';
  import type { WordImageUrls } from '$lib/exiliada/types';

  interface VerseLine {
    text: string;
    place?: string;
    placeText?: string;
    word?: string;
    wordText?: string;
    suffix?: string;
    place2?: string;
    placeText2?: string;
  }

  interface Props {
    number: number;
    lines: VerseLine[];
    onShowPlace?: (key: string) => void;
    wordImageUrls: WordImageUrls;
  }

  let { number, lines, onShowPlace, wordImageUrls }: Props = $props();

  // Roman numerals for stanza numbers
  const romanNumerals = ['I', 'II', 'III', 'IV', 'V'];

  let isPlaying = $derived(navigationState.currentStanza === number);
</script>

<div class="stanza" class:playing={isPlaying} data-stanza={number}>
  <span class="stanza-number">{romanNumerals[number - 1] || number}</span>
  {#each lines as line}
    <div class="verse-line">
      {line.text}{#if line.place}<PlaceLink placeKey={line.place} text={line.placeText || ''} {onShowPlace} />{/if}{#if line.word}<WordHint wordKey={line.word} text={line.wordText || ''} {wordImageUrls} />{/if}{#if line.suffix}{line.suffix}{/if}{#if line.place2}<PlaceLink placeKey={line.place2} text={line.placeText2 || ''} {onShowPlace} />{/if}
    </div>
  {/each}
</div>

<style>
  .stanza {
    margin-bottom: 2rem;
    padding: 1rem 0.5rem 1rem 1.8rem;
    position: relative;
    border-left: 2px solid rgba(139, 69, 19, 0.15);
    transition: all 0.3s ease;
    border-radius: 0 4px 4px 0;
    orphans: 3;
    widows: 3;
  }

  .stanza:hover {
    border-left-color: rgba(139, 69, 19, 0.35);
  }

  .stanza.playing {
    border-left-color: var(--color-gold);
    border-left-width: 3px;
  }

  .stanza.playing .stanza-number {
    color: var(--color-gold);
  }

  .stanza:last-child {
    margin-bottom: 0.5rem;
  }

  .stanza-number {
    position: absolute;
    left: -1.8rem;
    top: 0.15rem;
    font-size: 0.9rem;
    color: var(--color-earth);
    font-style: normal;
    font-weight: 400;
    transition: color 0.3s ease;
    font-family: var(--font-cormorant);
    line-height: 1;
  }

  .stanza-number::after {
    content: ".";
  }

  .verse-line {
    font-size: 1.1rem;
    line-height: 1.45;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-feature-settings: "liga" 1, "calt" 1, "kern" 1;
    hyphens: none;
    -webkit-hyphens: none;
    -ms-hyphens: none;
    word-break: normal;
    overflow-wrap: normal;
    font-weight: 500;
    letter-spacing: 0.003em;
  }

  /* Add spacing after every 2nd line (between couplets) */
  .verse-line:nth-of-type(even):not(:last-child) {
    margin-bottom: 0.55rem;
  }

  @media (max-width: 800px) {
    .stanza-number {
      position: static;
      display: block;
      font-size: 0.95rem;
      margin-bottom: 0.5rem;
      opacity: 0.5;
    }

    .stanza {
      padding: 0.75rem 1rem;
      margin-bottom: 1.75rem;
    }

    .verse-line {
      font-size: 1.15rem;
      line-height: 1.5;
    }

    .verse-line:nth-of-type(even):not(:last-child) {
      margin-bottom: 0.5rem;
    }
  }

  @media (max-width: 380px) {
    .verse-line {
      font-size: 1.05rem;
      line-height: 1.5;
    }

    .verse-line:nth-of-type(even):not(:last-child) {
      margin-bottom: 0.45rem;
    }

    .stanza {
      padding: 0.6rem 0.8rem;
      margin-bottom: 1.5rem;
    }

    .stanza-number {
      font-size: 0.85rem;
      margin-bottom: 0.4rem;
    }
  }
</style>
