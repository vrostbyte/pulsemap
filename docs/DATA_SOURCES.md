# PulseMap — Data Sources

All data sources used in PulseMap are publicly available US and international
government APIs.  No API keys are required except for EPA AirNow.

---

## CDC National Wastewater Surveillance System (NWSS)

- **What:** SARS-CoV-2 concentration in wastewater by county
- **URL:** https://data.cdc.gov/resource/2ew6-ywp6.json
- **Format:** Socrata JSON API
- **Key fields:** `county_fips`, `ptc_15d` (% change over 15 days), `percentile`
- **Update frequency:** Weekly
- **API key:** Not required (Socrata public endpoint)
- **Documentation:** https://www.cdc.gov/nwss/rv/COVID19-nationaltrend.html

## CDC FluView

- **What:** Influenza-like illness (ILI) % by HHS region
- **URL:** https://gis.cdc.gov/grasp/flu2/GetFlu2Data
- **Format:** JSON (POST request)
- **Key fields:** `REGION`, `ILI` (% of visits for ILI)
- **Update frequency:** Weekly (during flu season)
- **API key:** Not required
- **Documentation:** https://gis.cdc.gov/grasp/flu2/flu2help.html

## EPA AirNow

- **What:** Real-time AQI observations by ZIP code or coordinates
- **URL:** https://www.airnowapi.org/aq/observation/zipCode/current/
- **Format:** JSON
- **Key fields:** `AQI`, `Category.Name`, `ParameterName`, `Latitude`, `Longitude`
- **Update frequency:** Hourly
- **API key:** **Required** — free at https://docs.airnowapi.org/account/request/
- **Environment variable:** `AIRNOW_API_KEY`
- **Documentation:** https://docs.airnowapi.org/

## WHO Disease Outbreak News

- **What:** Formal outbreak notifications from WHO
- **URL:** https://www.who.int/rss-feeds/news-releases.xml
- **Format:** RSS/XML → parsed to JSON by our proxy
- **Key fields:** `title`, `link`, `pubDate`, `description`
- **Update frequency:** As outbreaks are reported
- **API key:** Not required
- **Documentation:** https://www.who.int/emergencies/disease-outbreak-news

## CMS Hospital Compare

- **What:** US hospital locations, types, emergency service availability
- **URL:** https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0
- **Format:** CMS Data Catalog JSON API
- **Key fields:** `hospital_name`, `hospital_type`, `emergency_services`, `location`
- **Update frequency:** Quarterly
- **API key:** Not required
- **Documentation:** https://data.cms.gov/provider-data/dataset/xubh-q36u

## NOAA National Weather Service Alerts

- **What:** Active severe weather and health-relevant alerts (heat, fog, cold, air quality)
- **URL:** https://api.weather.gov/alerts/active
- **Format:** GeoJSON
- **Key fields:** `event`, `headline`, `severity`, `urgency`, `geometry`
- **Update frequency:** ~5 minutes
- **API key:** Not required (requires `User-Agent` header)
- **Documentation:** https://www.weather.gov/documentation/services-web-api

## US Census Bureau Geocoding API

- **What:** ZIP code → county FIPS + centroid coordinates
- **URL:** https://geocoding.geo.census.gov/geocoder/geographies/address
- **Format:** JSON
- **Used by:** `src/geo/zipToFips.ts` (client-side, not proxied)
- **API key:** Not required
- **Documentation:** https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

---

## Notes on data quality

- **Wastewater:** Coverage is ~75% of US population. Rural counties may have no data.
- **FluView:** HHS region-level only (10 regions). No county-level granularity.
- **AirNow:** Urban bias — monitoring stations are concentrated in cities.
- **WHO Outbreaks:** International focus. US-specific outbreaks may be reported via CDC separately.
- **NWS Alerts:** Geographic extent can be very large (state-wide) or very small (county-level).
