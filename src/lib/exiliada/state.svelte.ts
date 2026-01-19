import type { Place, WordDefinition, SheetType } from './types';

// Use class-based stores for reliable cross-component reactivity in Svelte 5

class PlaybackStore {
  isPlaying = $state(false);
  currentTime = $state(0);
  duration = $state(0);
  isProgressDragging = $state(false);
}

class NavigationStore {
  currentPlaceKey = $state<string | null>(null);
  currentStanza = $state<number | null>(null);
  currentPlaceIndex = $state(-1); // For timing sync
  isUserInteracting = $state(false);
  interactionTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
}

class UIStore {
  isMobile = $state(false);
  activeSheet = $state<SheetType>(null);
  sheetPlaceKey = $state<string | null>(null);
  sheetPlace = $state<Place | null>(null);
  sheetWord = $state<WordDefinition | null>(null);
  // Image lightbox state
  lightboxOpen = $state(false);
  lightboxImageUrl = $state<string | null>(null);
  lightboxAlt = $state<string>('');
}

// Singleton instances
export const playbackState = new PlaybackStore();
export const navigationState = new NavigationStore();
export const uiState = new UIStore();

// Audio element reference (not reactive, just a holder)
export let audioElement: HTMLAudioElement | null = null;

export function setAudioElement(el: HTMLAudioElement) {
  audioElement = el;
}

// Actions
export function setPlaying(playing: boolean) {
  playbackState.isPlaying = playing;
}

export function setCurrentTime(time: number) {
  playbackState.currentTime = time;
}

export function setDuration(duration: number) {
  playbackState.duration = duration;
}

export function setProgressDragging(dragging: boolean) {
  playbackState.isProgressDragging = dragging;
}

export function setCurrentPlace(placeKey: string | null, stanza: number | null = null) {
  navigationState.currentPlaceKey = placeKey;
  if (stanza !== null) {
    navigationState.currentStanza = stanza;
  }
}

export function setCurrentStanza(stanza: number | null) {
  navigationState.currentStanza = stanza;
}

// User interaction tracking with 5s timeout
export function markUserInteracting() {
  if (navigationState.interactionTimeout) {
    clearTimeout(navigationState.interactionTimeout);
  }
  navigationState.isUserInteracting = true;
  navigationState.interactionTimeout = setTimeout(() => {
    navigationState.isUserInteracting = false;
    navigationState.interactionTimeout = null;
  }, 5000);
}

export function clearUserInteracting() {
  if (navigationState.interactionTimeout) {
    clearTimeout(navigationState.interactionTimeout);
    navigationState.interactionTimeout = null;
  }
  navigationState.isUserInteracting = false;
}

export function setIsMobile(mobile: boolean) {
  uiState.isMobile = mobile;
}

export function openPlaceSheet(placeKey: string, place: Place) {
  uiState.activeSheet = 'place';
  uiState.sheetPlaceKey = placeKey;
  uiState.sheetPlace = place;
}

export function openWordSheet(definition: WordDefinition) {
  uiState.activeSheet = 'word';
  uiState.sheetWord = definition;
}

export function openInfoSheet() {
  uiState.activeSheet = 'info';
}

// Track closing to prevent double-close from vaul bug (issue #136)
let isClosing = false;

export function closeSheet() {
  // Guard against vaul's double onOpenChange(false) on drag-to-close
  if (isClosing || uiState.activeSheet === null) return;

  isClosing = true;
  uiState.activeSheet = null;
  uiState.sheetPlaceKey = null;
  uiState.sheetPlace = null;
  uiState.sheetWord = null;

  // Reset guard after a tick
  setTimeout(() => {
    isClosing = false;
  }, 50);
}

// Seek audio to position
export function seekTo(time: number) {
  if (audioElement && !isNaN(time) && isFinite(time)) {
    audioElement.currentTime = time;
    playbackState.currentTime = time;
  }
}

export function togglePlayback() {
  if (audioElement) {
    if (audioElement.paused) {
      // Reset place selection when starting playback
      navigationState.currentPlaceKey = null;
      navigationState.currentStanza = null;
      navigationState.currentPlaceIndex = -1;
      audioElement.play();
    } else {
      audioElement.pause();
    }
  }
}

// Image lightbox
export function openLightbox(imageUrl: string, alt: string) {
  uiState.lightboxOpen = true;
  uiState.lightboxImageUrl = imageUrl;
  uiState.lightboxAlt = alt;
}

export function closeLightbox() {
  uiState.lightboxOpen = false;
  uiState.lightboxImageUrl = null;
  uiState.lightboxAlt = '';
}
