# PMTiles – SF extract

- **sf.pmtiles** – San Francisco regional extract (bbox: -122.52,37.70,-122.35,37.83, maxzoom 14) from Protomaps build 20260214. ~4 MB. Served at `/tiles/sf.pmtiles`; the map uses this when available.

To regenerate:

1. Install [PMTiles CLI](https://docs.protomaps.com/pmtiles/cli) (e.g. from [go-pmtiles releases](https://github.com/protomaps/go-pmtiles/releases)).
2. Run:
   ```bash
   pmtiles extract "https://build.protomaps.com/20260214.pmtiles" sf.pmtiles --bbox=-122.52,37.70,-122.35,37.83 --maxzoom=14
   ```

Replace the build date with a current build from [maps.protomaps.com/builds](https://maps.protomaps.com/builds) if needed.
