<script lang="ts">
    import { places } from "$lib/exiliada/data";
    import {
        navigationState,
        uiState,
        openPlaceSheet,
    } from "$lib/exiliada/state.svelte";

    let currentPlace = $derived(
        navigationState.currentPlaceKey
            ? places[navigationState.currentPlaceKey]
            : null,
    );

    function handleClick() {
        if (currentPlace && navigationState.currentPlaceKey) {
            openPlaceSheet(navigationState.currentPlaceKey, currentPlace);
        }
    }
</script>

{#if uiState.isMobile}
    <div
        class="mobile-place-bar"
        onclick={handleClick}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === "Enter" && handleClick()}
    >
        <div class="place-summary">
            {#if currentPlace}
                <span class="place-name">{currentPlace.name}</span>
                <span class="fragment"> — {currentPlace.fragment}</span>
            {:else}
                <span class="place-name italic"
                    >Reproduce la canción o toca un lugar para conocer su
                    historia</span
                >
            {/if}
        </div>
    </div>
{/if}

<style>
    .mobile-place-bar {
        display: flex;
        align-items: center;
        padding: 0 1rem;
        min-height: 36px;
        background: var(--color-parchment-dark);
        border-bottom: 1px solid rgba(44, 36, 22, 0.12);
        cursor: pointer;
    }

    .place-summary {
        font-size: 0.9rem;
        color: var(--color-ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }

    .place-name {
        font-weight: 500;
    }

    .fragment {
        color: var(--color-blood);
        font-style: italic;
        margin-left: 0.25rem;
    }
</style>
