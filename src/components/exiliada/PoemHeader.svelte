<script lang="ts">
    import { onMount } from "svelte";
    import { uiState, openInfoSheet } from "$lib/exiliada/state.svelte";

    let shouldPulse = $state(false);

    onMount(() => {
        // Check if user has opened the info sheet before
        const hasSeenInfo = localStorage.getItem('exiliada-info-seen');
        if (!hasSeenInfo) {
            shouldPulse = true;
        }
    });

    function handleInfoClick() {
        // Mark as seen on first click
        localStorage.setItem('exiliada-info-seen', 'true');
        shouldPulse = false;
        openInfoSheet();
    }
</script>

<div class="poem-header">
    <div class="header-row">
        <h1>La Exiliada del Sur</h1>
        <button
            class="info-icon"
            class:pulse={shouldPulse}
            aria-label="Abrir información sobre este poema"
            title="Sobre este poema"
            onclick={handleInfoClick}>?</button
        >
    </div>
    <span class="subtitle">Violeta Parra</span>
    <span class="year">(c. 1958)</span>
</div>

<style>
    .poem-header {
        grid-column: 1;
        grid-row: 1;
        padding: 1.25rem 1.25rem 1rem;
        border-bottom: 1px solid rgba(44, 36, 22, 0.12);
        border-right: 1px solid rgba(44, 36, 22, 0.12);
        background: linear-gradient(
            to bottom,
            var(--color-parchment),
            var(--color-parchment-dark)
        );
        position: relative;
    }

    .header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .poem-header h1 {
        font-size: 1.4rem;
        font-weight: 400;
        letter-spacing: 0.04em;
        margin-bottom: 0.1rem;
        font-feature-settings:
            "kern" 1,
            "liga" 1;
    }

    .subtitle {
        font-size: 0.95rem;
        color: var(--color-earth);
        font-style: italic;
        display: inline;
    }

    .year {
        font-size: 0.85rem;
        color: var(--color-earth);
        opacity: 0.7;
        margin-left: 0.3rem;
    }

    .info-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        font-size: 1rem;
        color: var(--color-earth);
        border: 1.5px solid var(--color-earth);
        border-radius: 50%;
        cursor: pointer;
        opacity: 0.7;
        transition: all 0.2s ease;
        background: transparent;
        padding: 0;
        flex-shrink: 0;
    }

    .info-icon:hover {
        opacity: 1;
        background: var(--color-parchment-dark);
        transform: scale(1.1);
    }

    .info-icon:active {
        transform: scale(0.95);
    }

    /* Subtle pulse animation - only for first-time visitors */
    .info-icon.pulse {
        animation: subtle-pulse 2.5s ease-in-out infinite;
    }

    .info-icon.pulse:hover {
        animation: none;
    }

    @keyframes subtle-pulse {
        0%, 100% {
            opacity: 0.5;
            transform: scale(1);
        }
        50% {
            opacity: 1;
            transform: scale(1.05);
        }
    }

    @media (max-width: 800px) {
        .poem-header {
            grid-column: unset;
            grid-row: unset;
            padding: 1.2rem 1rem;
            border-right: none;
        }

        .poem-header h1 {
            font-size: 1.2rem;
            line-height: 1.2;
        }

        .info-icon {
            opacity: 0.8;
            width: 26px;
            height: 26px;
            font-size: 1.05rem;
            /* Increase tap target to at least 44x44px for mobile accessibility */
            padding: 9px;
        }
    }
</style>
