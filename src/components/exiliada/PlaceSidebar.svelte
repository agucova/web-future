<script lang="ts">
    import { places } from "$lib/exiliada/data";
    import { navigationState, openLightbox } from "$lib/exiliada/state.svelte";
    import { formatCoords } from "$lib/exiliada/utils";
    import type { PlaceImageUrls } from "$lib/exiliada/types";

    interface Props {
        imageUrls: PlaceImageUrls;
        imageUrlsLarge?: PlaceImageUrls;
    }

    let { imageUrls, imageUrlsLarge }: Props = $props();

    let currentPlace = $derived(
        navigationState.currentPlaceKey
            ? places[navigationState.currentPlaceKey]
            : null,
    );
    let currentPlaceKey = $derived(navigationState.currentPlaceKey);

    function handleImageClick() {
        if (!currentPlaceKey || !currentPlace) return;
        // Use large image if available, otherwise fall back to regular
        const largeUrl = imageUrlsLarge?.[currentPlaceKey] || imageUrls[currentPlaceKey];
        if (largeUrl) {
            openLightbox(largeUrl, currentPlace.name);
        }
    }
</script>

<aside class="sidebar-info">
    <div class="place-info-content">
        {#if !currentPlace}
            <div class="info-default">
                <p>
                    Reproduce la canción o haz clic en un lugar en el poema para
                    conocer su historia.
                </p>
            </div>
        {:else}
            <div class="place-info visible">
                <button
                    class="place-image-container"
                    onclick={handleImageClick}
                    type="button"
                    aria-label="Ver imagen en grande"
                >
                    {#if currentPlaceKey && imageUrls[currentPlaceKey]}
                        <img
                            src={imageUrls[currentPlaceKey]}
                            alt={currentPlace.name}
                        />
                        <div class="image-expand-hint">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                    {/if}
                </button>
                <div class="place-text">
                    <div class="place-header">
                        <div class="place-title-row">
                            <h3>{currentPlace.name}</h3>
                            <span class="fragment"
                                >— {currentPlace.fragment}</span
                            >
                        </div>
                        <span class="coords"
                            >{formatCoords(currentPlace.coords)}</span
                        >
                    </div>
                    <div class="description">
                        {@html currentPlace.description}
                    </div>
                </div>
            </div>
        {/if}
    </div>
</aside>

<style>
    .sidebar-info {
        grid-column: 2;
        grid-row: 2;
        background: var(--color-parchment-dark);
        border-bottom: 1px solid rgba(44, 36, 22, 0.12);
        overflow-y: auto;
    }

    .place-info-content {
        flex: 1;
        padding: 1rem 1.25rem;
        overflow-y: auto;
    }

    .info-default {
        color: var(--color-earth);
        font-style: italic;
        text-align: center;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .info-default p {
        font-size: 0.95rem;
        line-height: 1.5;
    }

    .place-info {
        display: none;
    }

    .place-info.visible {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
    }

    .place-image-container {
        flex-shrink: 0;
        width: 120px;
        height: 120px;
        overflow: hidden;
        border-radius: 4px;
        background: var(--color-parchment-dark);
        border: none;
        padding: 0;
        cursor: pointer;
        position: relative;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .place-image-container:hover {
        transform: scale(1.02);
        box-shadow: 0 4px 12px rgba(44, 36, 22, 0.2);
    }

    .place-image-container:active {
        transform: scale(0.98);
    }

    .place-image-container img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .image-expand-hint {
        position: absolute;
        bottom: 6px;
        right: 6px;
        width: 28px;
        height: 28px;
        background: rgba(44, 36, 22, 0.7);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-parchment);
        opacity: 0;
        transition: opacity 0.2s ease;
    }

    .place-image-container:hover .image-expand-hint {
        opacity: 1;
    }

    .place-text {
        flex: 1;
        min-width: 0;
    }

    .place-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
    }

    .place-title-row {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        flex-wrap: wrap;
    }

    h3 {
        font-family: var(--font-cormorant);
        font-size: 1.125rem;
        font-weight: 500;
        margin: 0;
        color: var(--color-ink);
    }

    .fragment {
        font-family: var(--font-cormorant);
        font-style: italic;
        color: var(--color-blood);
        font-size: 0.875rem;
    }

    .coords {
        font-family: var(--font-source-serif);
        font-size: 0.75rem;
        color: var(--color-earth);
        opacity: 0.7;
        white-space: nowrap;
        margin-left: 0.5rem;
    }

    .description {
        font-size: 0.875rem;
        color: var(--color-ink-light);
        line-height: 1.6;
        font-family: var(--font-source-serif);
    }

    .description :global(a) {
        color: var(--color-gold);
        text-decoration: none;
        border-bottom: 1px solid rgba(181, 134, 67, 0.3);
        transition: all 0.2s ease;
    }

    .description :global(a:hover) {
        color: var(--color-ink);
        border-bottom-color: var(--color-gold);
    }

    .description :global(a:active) {
        opacity: 0.7;
    }

    @media (max-width: 800px) {
        .sidebar-info {
            display: none;
        }
    }
</style>
