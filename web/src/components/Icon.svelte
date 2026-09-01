<script>
  let { name, size = 20, strokeWidth = 1.8 } = $props();
</script>

<svg
  class="ui-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'library'}
    <path d="M4 19.5V5.8a1.8 1.8 0 0 1 1.8-1.8H18v15.5H6.2A2.2 2.2 0 0 0 4 21.7" />
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H18" />
    <path d="M8 7.5h6" />
  {:else if name === 'home'}
    <path d="m3.5 10.5 8.5-7 8.5 7v8a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2Z" />
    <path d="M9.5 20.5v-6h5v6" />
  {:else if name === 'note'}
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
    <path d="M14 3v6h6M8 13h8M8 17h5" />
  {:else if name === 'folder'}
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
  {:else if name === 'refresh'}
    <path d="M20 6v5h-5" /><path d="M4 18v-5h5" />
    <path d="M18.2 9A7 7 0 0 0 6.5 6.5L4 11M6 15a7 7 0 0 0 11.5 2.5L20 13" />
  {:else if name === 'chevron'}
    <path d="m9 18 6-6-6-6" />
  {:else if name === 'arrow-left'}
    <path d="m15 18-6-6 6-6M9 12h11" />
  {:else if name === 'file'}
    <path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-12Z" />
    <path d="M14 2.5v5h5M8.5 13h7M8.5 17h5" />
  {:else if name === 'external'}
    <path d="M15 4h5v5M13 11l7-7M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
  {:else if name === 'logout'}
    <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
    <path d="m17 8 4 4-4 4M21 12H9" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'close'}
    <path d="m6 6 12 12M18 6 6 18" />
  {:else if name === 'check'}
    <path d="m5 12 4 4L19 6" />
  {:else if name === 'panel'}
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M14.5 4.5v15" />
  {:else if name === 'trash'}
    <path d="M4 6.5h16M9 6.5V4.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.7M6.5 6.5 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5" />
    <path d="M10.3 10.5v6.3M13.7 10.5v6.3" />
  {:else if name === 'alert'}
    <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" />
  {:else if name === 'shield'}
    <path d="M12 3 5 6v5c0 4.7 2.8 8.1 7 10 4.2-1.9 7-5.3 7-10V6Z" />
    <path d="m9 12 2 2 4-4" />
  {:else if name === 'spark'}
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  {:else if name === 'grid'}
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  {:else if name === 'list'}
    <path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
  {:else if name === 'close'}
    <path d="M18 6 6 18M6 6l12 12" />
  {/if}
</svg>
