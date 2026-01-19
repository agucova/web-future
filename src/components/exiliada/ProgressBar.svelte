<script lang="ts">
  import { playbackState, setProgressDragging, seekTo } from '$lib/exiliada/state.svelte';
  import { formatTime } from '$lib/exiliada/utils';

  let containerEl: HTMLDivElement;

  let percent = $derived(
    playbackState.duration > 0
      ? (playbackState.currentTime / playbackState.duration) * 100
      : 0
  );

  // Show handle once playback has started or user is dragging
  let showHandle = $derived(
    playbackState.isPlaying || playbackState.isProgressDragging || playbackState.currentTime > 0
  );

  function getPercentFromEvent(e: MouseEvent | Touch): number {
    if (!containerEl) return 0;
    const rect = containerEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function handleClick(e: MouseEvent) {
    // Only seek if we have a valid duration
    if (playbackState.duration > 0) {
      const pct = getPercentFromEvent(e);
      seekTo(pct * playbackState.duration);
    }
  }

  function handleMouseDown(e: MouseEvent) {
    // Only allow dragging if we have a valid duration
    if (playbackState.duration <= 0) return;

    e.preventDefault();
    setProgressDragging(true);

    const handleMouseMove = (e: MouseEvent) => {
      const pct = getPercentFromEvent(e);
      // Update visual only during drag
      playbackState.currentTime = pct * playbackState.duration;
    };

    const handleMouseUp = (e: MouseEvent) => {
      setProgressDragging(false);
      const pct = getPercentFromEvent(e);
      seekTo(pct * playbackState.duration);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleTouchStart(e: TouchEvent) {
    // Only allow dragging if we have a valid duration
    if (playbackState.duration <= 0) return;

    e.preventDefault();
    setProgressDragging(true);

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const pct = getPercentFromEvent(e.touches[0]);
        playbackState.currentTime = pct * playbackState.duration;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      setProgressDragging(false);
      if (e.changedTouches.length > 0) {
        const pct = getPercentFromEvent(e.changedTouches[0]);
        seekTo(pct * playbackState.duration);
      }
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  }
</script>

<div
  class="progress-container"
  bind:this={containerEl}
  onclick={handleClick}
  role="slider"
  aria-label="Posición de reproducción"
  aria-valuemin={0}
  aria-valuemax={playbackState.duration}
  aria-valuenow={playbackState.currentTime}
  aria-valuetext={formatTime(playbackState.currentTime)}
  tabindex="0"
>
  <div class="progress-bar" style="width: {percent}%"></div>
  <div
    class="progress-handle"
    class:visible={showHandle}
    style="left: {percent}%"
    onmousedown={handleMouseDown}
    ontouchstart={handleTouchStart}
    role="presentation"
  ></div>
</div>

<style>
  .progress-container {
    flex: 1;
    height: 6px;
    background: rgba(44, 36, 22, 0.1);
    border-radius: 3px;
    cursor: pointer;
    position: relative;
    margin: 0 0.25rem;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--color-blood) 0%, var(--color-gold) 100%);
    border-radius: 3px;
    transition: width 0.1s linear;
  }

  .progress-handle {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    background: var(--color-parchment);
    border: 2px solid var(--color-blood);
    border-radius: 50%;
    cursor: grab;
    opacity: 0;
    transition: opacity 0.2s, transform 0.1s;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  .progress-container:hover .progress-handle,
  .progress-handle:active {
    opacity: 1;
  }

  .progress-handle:active {
    cursor: grabbing;
    transform: translate(-50%, -50%) scale(1.2);
  }

  @media (max-width: 800px) {
    .progress-container {
      height: 8px;
    }

    .progress-handle {
      width: 18px;
      height: 18px;
    }

    .progress-handle.visible {
      opacity: 1;
    }
  }
</style>
