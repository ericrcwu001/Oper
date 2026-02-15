# Map label fonts (Lat2-Terminus16)

Map labels use the **Lat2-Terminus16** font (Terminus TTF). Glyphs are served from this directory.

## Setup

From the `frontend` directory:

```bash
pnpm run setup-fonts
# or: node scripts/setup-fonts.js
```

This downloads Terminus TTF and prints instructions. You must complete one manual step:

1. Open [MapLibre Font Maker](https://maplibre.org/font-maker/)
2. Upload the TTF from `.font-temp/` (e.g. `TerminusTTF-4.49.3.ttf`)
3. Name the font: **Lat2-Terminus16**
4. Download the generated ZIP
5. Extract into `public/fonts/Lat2-Terminus16/` (folder should contain `0-255.pbf`, `256-511.pbf`, etc.)

Restart the dev server after adding the glyphs.
