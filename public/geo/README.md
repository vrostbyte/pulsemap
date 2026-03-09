# GeoJSON Data Files

This directory holds county and ZIP code boundary GeoJSON files used for
choropleth map rendering.

## Files expected here (not committed — download separately)

| File | Description | Source | Size |
|------|-------------|--------|------|
| `counties.geojson` | US county boundaries (simplified, ~1MB) | [US Census TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html) | ~1 MB |
| `zip-codes.geojson` | US ZIP code tabulation areas (simplified) | [US Census ZCTA](https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html) | ~15 MB |

## How to download

```bash
# County boundaries (20m simplified — good enough for national view)
curl -L "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json" \
  -o public/geo/counties-10m.json

# Or the raw Census shapefile (convert with mapshaper):
# https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip
```

## Usage in PulseMap

These files are loaded lazily in `src/geo/layers/` only when a choropleth
layer is requested.  For the MVP scatter-plot approach they are not needed —
the latitude/longitude in each HealthSignal is sufficient for rendering.

County boundary files will be used in a future version to render filled
county polygons colored by risk score (choropleth view).
