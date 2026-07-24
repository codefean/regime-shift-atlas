# Regime Shift Atlas — mobile update

This bundle contains the mobile-responsive implementation requested for the existing dashboard.

## Implemented

- Two-step country selection on coarse-pointer/touch devices.
- Sticky mobile country action bar with Clear and Open profile actions.
- Explore map / Exit map control so the map does not trap page scrolling.
- Dynamic mobile map height using `svh`.
- Descriptive map accessibility label and removal of `role="application"`.
- Predictable two-row mobile header with shortened labels at very narrow widths.
- Sticky, horizontally scrollable country-page contents navigation.
- Active country-page section highlighting using `IntersectionObserver`.
- Compact two-column country statistics on mobile, falling to one column below 430px.
- Horizontally scrollable, snap-aligned analysis cards.
- Snap-aligned timeline scrolling.
- 44–48px touch targets for search, filters, links, and buttons.
- Reduced-motion support and improved keyboard focus visibility.
- Added the missing `display: grid` declaration to `.intro-shell`.

## Not changed

- Data loading, precomputed country JSON, and caching behavior were intentionally left unchanged.
- Existing `data/` file paths remain the same. Keep this bundle alongside the project's existing `data` directory.

## Validation

- `node --check app.js`
- `node --check country.js`
- HTML parsed successfully for both pages.
- CSS opening and closing braces are balanced.

A complete live preview still requires the project's existing local data files and access to the external Leaflet/map resources.
