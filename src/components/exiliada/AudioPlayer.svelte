<script lang="ts">
    import { onMount } from "svelte";
    import ProgressBar from "./ProgressBar.svelte";
    import {
        playbackState,
        setAudioElement,
        setPlaying,
        setCurrentTime,
        setDuration,
        togglePlayback,
    } from "$lib/exiliada/state.svelte";
    import { formatTime, throttle } from "$lib/exiliada/utils";

    interface Props {
        onTimeUpdate?: (timeMs: number) => void;
    }

    let { onTimeUpdate }: Props = $props();

    let audioEl: HTMLAudioElement;

    // Throttled UI update to reduce rerenders (progress bar, time display)
    const throttledUIUpdate = throttle((time: number) => {
        if (!playbackState.isProgressDragging) {
            setCurrentTime(time);
        }
    }, 100);

    onMount(() => {
        setAudioElement(audioEl);

        const handleLoadedMetadata = () => {
            if (
                audioEl.duration &&
                !isNaN(audioEl.duration) &&
                isFinite(audioEl.duration)
            ) {
                setDuration(audioEl.duration);
            }
        };

        const handleDurationChange = () => {
            if (
                audioEl.duration &&
                !isNaN(audioEl.duration) &&
                isFinite(audioEl.duration)
            ) {
                setDuration(audioEl.duration);
            }
        };

        const handleTimeUpdate = () => {
            const currentTime = audioEl.currentTime;
            // UI updates are throttled (progress bar doesn't need 60fps)
            throttledUIUpdate(currentTime);
            // Place sync is NOT throttled - needs to be responsive to music
            if (!playbackState.isProgressDragging) {
                onTimeUpdate?.(currentTime * 1000);
            }
        };

        const handlePlay = () => {
            setPlaying(true);
        };

        const handlePause = () => {
            setPlaying(false);
        };

        const handleEnded = () => {
            setPlaying(false);
            setCurrentTime(0);
        };

        // Check if metadata is already loaded
        if (
            audioEl.readyState >= 1 &&
            audioEl.duration &&
            !isNaN(audioEl.duration)
        ) {
            setDuration(audioEl.duration);
        }

        audioEl.addEventListener("loadedmetadata", handleLoadedMetadata);
        audioEl.addEventListener("durationchange", handleDurationChange);
        audioEl.addEventListener("timeupdate", handleTimeUpdate);
        audioEl.addEventListener("play", handlePlay);
        audioEl.addEventListener("pause", handlePause);
        audioEl.addEventListener("ended", handleEnded);

        // Cleanup
        return () => {
            audioEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audioEl.removeEventListener("durationchange", handleDurationChange);
            audioEl.removeEventListener("timeupdate", handleTimeUpdate);
            audioEl.removeEventListener("play", handlePlay);
            audioEl.removeEventListener("pause", handlePause);
            audioEl.removeEventListener("ended", handleEnded);
        };
    });
</script>

<div class="audio-player-row">
    <div class="audio-player" class:playing={playbackState.isPlaying}>
        <audio bind:this={audioEl} preload="metadata">
            <source
                src="/exiliada-del-sur/exiliada_del_sur_inti_illimani.opus"
                type="audio/ogg"
            />
        </audio>

        <button
            class="play-btn"
            aria-label={playbackState.isPlaying ? "Pausar" : "Reproducir"}
            onclick={togglePlayback}
        >
            <span class="play-icon">▶</span>
            <span class="pause-icon">❚❚</span>
        </button>

        <div class="player-info">
            <div class="track-title">La Exiliada del Sur</div>
            <div class="track-artist">Inti Illimani</div>
        </div>

        <ProgressBar />

        <div class="time-display">
            <span>{formatTime(playbackState.currentTime)}</span>
            <span class="time-separator">/</span>
            <span>{formatTime(playbackState.duration)}</span>
        </div>
    </div>
</div>

<style>
    .audio-player-row {
        grid-column: 2;
        grid-row: 1;
        padding: 0.75rem 1rem;
        background: var(--color-parchment-dark);
        border-bottom: 1px solid rgba(44, 36, 22, 0.12);
    }

    .audio-player {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0.8rem;
        background: var(--color-parchment);
        border-radius: 8px;
        box-shadow:
            0 1px 3px rgba(44, 36, 22, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(44, 36, 22, 0.12);
    }

    .audio-player audio {
        display: none;
    }

    .play-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px solid var(--color-blood);
        background: var(--color-parchment);
        color: var(--color-blood);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        flex-shrink: 0;
        position: relative;
    }

    .play-btn:hover {
        background: var(--color-blood);
        color: var(--color-parchment);
        transform: scale(1.05);
    }

    .play-btn:active {
        transform: scale(0.98);
    }

    .play-icon {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 0.7rem;
        margin-left: 2px;
        margin-top: 1px;
        line-height: 1;
    }

    .pause-icon {
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 0.65rem;
        letter-spacing: 1px;
    }

    .audio-player.playing .play-icon {
        display: none;
    }

    .audio-player.playing .pause-icon {
        display: block;
    }

    .audio-player.playing .play-btn {
        background: var(--color-blood);
        color: var(--color-parchment);
        animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            box-shadow: 0 0 0 0 rgba(114, 47, 55, 0.4);
        }
        50% {
            box-shadow: 0 0 0 6px rgba(114, 47, 55, 0);
        }
    }

    .player-info {
        flex-shrink: 0;
        min-width: 0;
    }

    .track-title {
        font-family: var(--font-cormorant);
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--color-ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .track-artist {
        font-family: var(--font-cormorant);
        font-size: 0.85rem;
        color: var(--color-earth);
        white-space: nowrap;
    }

    .time-display {
        font-family: var(--font-source-serif);
        font-size: 0.72rem;
        color: var(--color-earth);
        white-space: nowrap;
        flex-shrink: 0;
        min-width: 70px;
        text-align: right;
    }

    .time-separator {
        opacity: 0.5;
        margin: 0 2px;
    }

    @media (max-width: 800px) {
        .audio-player-row {
            grid-column: unset;
            grid-row: unset;
            border-bottom: none;
            background: var(--color-parchment);
        }

        .audio-player {
            gap: 0.5rem;
            padding: 0.5rem 0.6rem;
        }

        .player-info {
            display: none;
        }

        .play-btn {
            width: 44px;
            height: 44px;
        }

        .time-display {
            font-size: 0.65rem;
            min-width: 60px;
        }
    }
</style>
