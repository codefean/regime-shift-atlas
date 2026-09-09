# Leaflet Regime Shift Atlas RSDB integration

This is the Leaflet embed version of the Regime Shift Atlas. It is designed to stay separate from the Mapbox version while using the same RSDB data export pattern.

The main `index.html` file is embed-only: it does not include its own site header, navigation bar, intro section, about section, or footer. The RSDB website should provide the surrounding page layout.

## Included

- `index.html` - embed-only Leaflet world map with country hover/highlight, country click-through, and visible regime-shift case-study points.
- `app.js` - world-map controller.
- `country.html` - country profile page.
- `country.js` - country-profile controller.
- `regime-data.js` - shared CSV parser and point-in-polygon logic.
- `atlas-config.js` - small path/config file so the atlas can move without editing the main map code.
- `99-leaflet_atlas_export.R` - RSDB-side export helper that writes the CSV used by the Leaflet atlas.
- `styles.css` - atlas styling.

## What to copy into RSDB

Copy this folder into the RSDB project at:

    assets/leaflet-atlas/

Then copy `99-leaflet_atlas_export.R` from this folder to the RSDB project root, next to `99-rsdb_map.R`.

## Export the data

From the RSDB project root, run:

    source("99-leaflet_atlas_export.R")

That creates:

    assets/leaflet-atlas/data/regime_shift_database.csv

The atlas expects `long` and `lat` columns, plus RSDB fields such as `case_study_name`, `type`, `ecosystem_type`, `location_countries`, `summary`, and references. The export also adds:

    case_url
    regime_shift_url

Those two columns connect the Leaflet point popups and country case cards back to the generated RSDB pages.

## Replace the old R map chunk

In `index.Rmd` and/or `cases.Rmd`, replace the old `load("assets/map_rsdb.Rda")` / `frameWidget(map_rsdb, ...)` chunk with:

```html
<iframe
  src="assets/leaflet-atlas/index.html"
  style="width: 100%; height: 720px; border: 0;"
  loading="lazy">
</iframe>
```

Adjust the iframe height if the page needs a taller or shorter map. The embedded page will fill the iframe and will not add a duplicate RSDB header or nav.

## Required data files

Keep this boundary file inside the Leaflet atlas folder:

    assets/leaflet-atlas/data/marine-land-countries.geojson

The country calculation uses the full boundary GeoJSON so country profile pages can count points against the same marine and land zones.

## Configuration

If the folder location changes, edit only `atlas-config.js`. The main values are:

    regimeDataUrl
    boundaryDataUrl
    countryPageUrl
    rsdbHomeUrl
    rsdbRegimeShiftsUrl
    linkTarget

## Click-through wiring

When a user clicks a country, `index.html` opens:

    country.html?code=ISO3&name=Country%20Name

The main map works like the Mapbox version: hover highlights the country or marine boundary, then click the country to open/select its profile. Regime-shift points are visible on the main map but do not capture hover or click events there.

On the country profile page, point popups remain clickable. The popup title and `Read more` button link to `case_url`. The regime-shift type links to `regime_shift_url`.

By default, popup links use `linkTarget: "_top"` so RSDB case pages open in the parent browser window rather than inside the iframe.
