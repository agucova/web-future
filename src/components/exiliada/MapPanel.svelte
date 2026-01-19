<script lang="ts">
  import { onMount } from 'svelte';
  import type { Map as LeafletMap, Marker } from 'leaflet';
  import { places } from '$lib/exiliada/data';
  import {
    navigationState,
    uiState,
    setCurrentPlace,
    markUserInteracting,
    openPlaceSheet,
  } from '$lib/exiliada/state.svelte';

  interface Props {
    onPlaceClick?: (key: string) => void;
  }

  let { onPlaceClick }: Props = $props();

  let mapContainer: HTMLDivElement;
  let map: LeafletMap | null = null;
  let markers: Record<string, Marker> = {};

  // Track current place to update marker styles
  let prevPlaceKey: string | null = null;

  // Flag to ignore events during programmatic map movements
  let isProgrammaticMove = false;

  $effect(() => {
    const currentKey = navigationState.currentPlaceKey;
    if (map && currentKey && currentKey !== prevPlaceKey && !navigationState.isUserInteracting) {
      const place = places[currentKey];
      if (place) {
        // Set flag to ignore events during programmatic movement
        isProgrammaticMove = true;

        // Smooth map animation
        map.flyTo(place.coords, 9, {
          animate: true,
          duration: 1.5,
        });

        // Clear flag after animation completes
        setTimeout(() => {
          isProgrammaticMove = false;
        }, 1600); // Slightly longer than animation duration
      }
    }

    // Update marker highlights
    if (markers) {
      // Remove active from previous
      if (prevPlaceKey && markers[prevPlaceKey]) {
        const el = markers[prevPlaceKey].getElement();
        if (el) {
          const dot = el.querySelector('.marker-dot');
          if (dot) dot.classList.remove('active');
        }
      }

      // Add active to current
      if (currentKey && markers[currentKey]) {
        const el = markers[currentKey].getElement();
        if (el) {
          const dot = el.querySelector('.marker-dot');
          if (dot) dot.classList.add('active');
        }
      }
    }

    prevPlaceKey = currentKey;
  });

  onMount(() => {
    // Use IIFE for async init while returning sync cleanup
    (async () => {
      // Dynamically import Leaflet to avoid SSR issues
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      try {
        map = L.map(mapContainer, {
        center: [-37.5, -72.0],
        zoom: 6,
        zoomControl: false,
      });

      // Add custom styled zoom control
      L.control.zoom({
        position: 'topleft',
        zoomInText: '+',
        zoomOutText: '−',  // Proper minus sign
      }).addTo(map);

      // Remove the default text to prevent doubling
      setTimeout(() => {
        const zoomOut = document.querySelector('.leaflet-control-zoom-out');
        if (zoomOut) {
          zoomOut.textContent = '';
          zoomOut.innerHTML = '<span style="font-family: Georgia, serif; font-size: 1.5rem; font-weight: 400; color: var(--color-earth); transform: translateY(-2px); display: block;">−</span>';
        }
      }, 0);

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20
        }
      ).addTo(map);

      // FIX: Track user interaction to prevent auto-sync
      // Only mark as user interaction if not a programmatic move
      map.on('dragstart', () => {
        if (!isProgrammaticMove) markUserInteracting();
      });
      map.on('zoomstart', () => {
        if (!isProgrammaticMove) markUserInteracting();
      });

      // Create markers
      Object.keys(places).forEach((key) => {
        const place = places[key];
        const isFinal = key === 'rinihue';
        const size = 16; // All markers same base size
        const bgColor = '#722f37'; // All markers start with rust color

        const icon = L.divIcon({
          className: 'custom-marker-wrapper',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div class="marker-dot${isFinal ? ' final' : ''}" style="width:${size}px;height:${size}px;background:${bgColor};border:3px solid #f6f3ea;border-radius:50%;box-sizing:border-box;"></div>`,
        });

        const marker = L.marker(place.coords, { icon }).addTo(map!);

        marker.on('click', () => {
          setCurrentPlace(key);
          if (uiState.isMobile) {
            openPlaceSheet(key, place);
          }
          onPlaceClick?.(key);
        });

        // Add tooltip
        marker.bindTooltip(place.name, {
          permanent: false,
          direction: 'top',
          className: 'place-tooltip',
          offset: [0, -8],
        });

        markers[key] = marker;
      });

      // Fit bounds to all markers
      const allCoords = Object.values(places).map((p) => p.coords);
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [20, 20] });
    } catch (e) {
        console.error('Map init failed:', e);
        if (mapContainer) {
          mapContainer.innerHTML =
            '<div style="padding: 40px; text-align: center; color: #5c4a3d; font-style: italic;">Mapa no disponible en este visor.<br><br>Descarga el archivo y ábrelo<br>en un navegador para ver el mapa.</div>';
        }
      }
    })();

    return () => {
      if (map) {
        map.remove();
        map = null;
      }
    };
  });
</script>

<div class="map-panel">
  <div class="map" bind:this={mapContainer}></div>
</div>

<style>
  .map-panel {
    grid-column: 2;
    grid-row: 3;
    flex: 1;
    position: relative;
  }

  .map {
    height: 100%;
    width: 100%;
    background: var(--color-sea);
  }

  /* Leaflet customizations */
  :global(.leaflet-container) {
    background: var(--color-sea);
    font-family: var(--font-cormorant);
  }

  /* Custom styled zoom controls */
  :global(.leaflet-control-zoom) {
    border: none !important;
    box-shadow: 0 2px 8px rgba(44, 36, 22, 0.15);
  }

  :global(.leaflet-control-zoom a) {
    background: rgba(246, 243, 234, 0.95) !important;
    border: 2.5px solid rgba(139, 69, 19, 0.3) !important;
    color: var(--color-earth) !important;
    font-family: 'Georgia', serif !important;
    font-size: 1.5rem !important;
    font-weight: 400 !important;
    width: 38px !important;
    height: 38px !important;
    border-radius: 4px !important;
    transition: all 0.2s ease !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    text-decoration: none !important;
  }

  :global(.leaflet-control-zoom a:first-child) {
    border-bottom: none !important;
    border-radius: 4px 4px 0 0 !important;
  }

  :global(.leaflet-control-zoom a:last-child) {
    border-top: 2.5px solid rgba(139, 69, 19, 0.3) !important;
    border-radius: 0 0 4px 4px !important;
  }


  :global(.leaflet-control-zoom a:hover) {
    background: var(--color-parchment) !important;
    border-color: rgba(139, 69, 19, 0.4) !important;
    color: var(--color-rust) !important;
  }

  :global(.leaflet-control-zoom a:active) {
    background: var(--color-parchment-dark) !important;
  }

  :global(.leaflet-control-zoom a.leaflet-disabled) {
    opacity: 0.4 !important;
    cursor: not-allowed !important;
  }

  :global(.custom-marker-wrapper) {
    background: transparent !important;
    border: none !important;
  }

  /* Markers with visible outer ring */
  :global(.marker-dot) {
    box-shadow:
      0 0 0 1px rgba(114, 47, 55, 0.3),
      0 2px 6px rgba(114, 47, 55, 0.3),
      inset 0 1px 2px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }

  :global(.marker-dot:hover) {
    transform: scale(1.2);
    box-shadow:
      0 0 0 2px rgba(114, 47, 55, 0.4),
      0 3px 10px rgba(114, 47, 55, 0.4),
      inset 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  :global(.marker-dot.active) {
    background: #b8860b !important;
    border-color: #fff !important;
    transform: scale(1.5);
    box-shadow:
      0 0 0 2px rgba(184, 134, 11, 0.3),
      0 4px 14px rgba(184, 134, 11, 0.5),
      inset 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  :global(.marker-dot.final) {
    /* Final marker slightly larger but same style as regular markers when not active */
    transform: scale(1.25);
    box-shadow:
      0 0 0 1px rgba(114, 47, 55, 0.3),
      0 2px 6px rgba(114, 47, 55, 0.3),
      inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  :global(.marker-dot.final.active) {
    /* Golden style only when active */
    box-shadow:
      0 0 0 2px rgba(184, 134, 11, 0.3),
      0 4px 14px rgba(184, 134, 11, 0.5),
      inset 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  :global(.place-tooltip) {
    background: #2c2416;
    color: #f6f3ea;
    border: none;
    border-radius: 3px;
    font-family: var(--font-cormorant);
    font-size: 0.85rem;
    padding: 4px 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  :global(.place-tooltip::before) {
    border-top-color: #2c2416;
  }

  :global(.leaflet-popup-content-wrapper) {
    background: var(--color-parchment);
    border-radius: 2px;
    box-shadow: 0 3px 14px rgba(0, 0, 0, 0.2);
  }

  :global(.leaflet-popup-content) {
    font-family: var(--font-cormorant);
    margin: 10px 14px;
    font-size: 0.95rem;
  }

  :global(.leaflet-popup-tip) {
    background: var(--color-parchment);
  }

  @media (max-width: 800px) {
    .map-panel {
      grid-column: unset;
      grid-row: unset;
      height: 180px;
      min-height: 180px;
      width: 100%;
    }

    .map {
      height: 180px;
      min-height: 180px;
      width: 100%;
    }
  }
</style>
