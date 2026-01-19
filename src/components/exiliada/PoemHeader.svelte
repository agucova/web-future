<script lang="ts">
    import { uiState, openInfoSheet } from "$lib/exiliada/state.svelte";

    function handleInfoClick() {
        openInfoSheet();
    }
</script>

<div class="poem-header">
    <h1>La Exiliada del Sur</h1>
    <span class="subtitle">Violeta Parra</span>
    <span class="year">(c. 1958)</span>
    <button
        class="info-icon"
        aria-label="Información sobre el poema"
        onclick={handleInfoClick}>i</button
    >
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
        display: inline-block;
        width: 16px;
        height: 16px;
        line-height: 16px;
        text-align: center;
        font-size: 0.7rem;
        color: var(--color-earth);
        border: 1px solid var(--color-earth);
        border-radius: 50%;
        margin-left: 0.4rem;
        cursor: pointer;
        position: relative;
        vertical-align: middle;
        opacity: 0.6;
        transition: all 0.2s ease;
        background: transparent;
        padding: 0;
    }

    .info-icon:hover {
        opacity: 1;
        background: var(--color-parchment-dark);
        transform: scale(1.1);
    }

    .info-icon:active {
        transform: scale(0.95);
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
            cursor: pointer;
            opacity: 0.8;
        }
    }
</style>
