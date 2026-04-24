import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clampActorUnderlayValue,
  clampActorVibrantValue,
  getBestDarkLightPairFromImage,
  getDarkColorsFromPalette,
  getLightColorsFromPalette,
} from "../src/main.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const portraitsDir = path.join(rootDir, "tmp-scripts", "portraits");
const outHtml = path.join(rootDir, "tmp-scripts", "portraits.html");

const BRAND_BG = "#4c2b51";
const PALETTE_SWATCH_COLUMN_COUNT = 10;

const IMAGE_EXT = new Set([
  ".webp",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".avif",
]);

function escapeHtmlAttr(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function uniqueByHex(colors) {
  const seen = new Set();
  const out = [];
  for (const c of colors) {
    const key = c.hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function darkPaletteSwatchCellsHtml(palette) {
  const darkList = uniqueByHex(getDarkColorsFromPalette(palette)).slice(
    0,
    PALETTE_SWATCH_COLUMN_COUNT
  );
  const cells = [];
  for (let i = 0; i < PALETTE_SWATCH_COLUMN_COUNT; i++) {
    const c = darkList[i];
    if (c) {
      cells.push(
        `      <td class="col-palette-dark" style="background-color: ${c.hex}" title="${escapeHtmlAttr(c.hex)}"></td>`
      );
    } else {
      cells.push(`      <td class="col-palette-dark col-palette-dark--empty"></td>`);
    }
  }
  return cells.join("\n");
}

function lightPaletteSwatchCellsHtml(palette) {
  const lightList = uniqueByHex(getLightColorsFromPalette(palette)).slice(
    0,
    PALETTE_SWATCH_COLUMN_COUNT
  );
  const cells = [];
  for (let i = 0; i < PALETTE_SWATCH_COLUMN_COUNT; i++) {
    const c = lightList[i];
    if (c) {
      cells.push(
        `      <td class="col-palette-light" style="background-color: ${c.hex}" title="${escapeHtmlAttr(c.hex)}"></td>`
      );
    } else {
      cells.push(`      <td class="col-palette-light col-palette-light--empty"></td>`);
    }
  }
  return cells.join("\n");
}

async function generatePortraits() {
  let entries;
  try {
    entries = await fs.readdir(portraitsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`Missing directory: ${portraitsDir}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const files = entries
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const rowParts = [];
  for (const file of files) {
    const absPath = path.join(portraitsDir, file);
    const { dark, light, rating, palette } =
      await getBestDarkLightPairFromImage(absPath);
    const darkDisplay = clampActorUnderlayValue(dark);
    const lightDisplay = clampActorVibrantValue(light);
    const src = `portraits/${encodeURIComponent(file)}`;
    const alt = escapeHtmlAttr(path.parse(file).name);
    const ratingTitle = escapeHtmlAttr(`Pair rating ${rating.toFixed(2)}`);
    const darkSwatches = darkPaletteSwatchCellsHtml(palette);
    const lightSwatches = lightPaletteSwatchCellsHtml(palette);
    rowParts.push(`    <tr>
      <td class="col-brand"><div class="sq-brand" role="presentation"></div></td>
      <td class="col-swatch" style="background-color: ${darkDisplay.hex}" title="${ratingTitle}"><img src="${src}" alt="${alt}"></td>
      <td class="col-swatch" style="background-color: ${lightDisplay.hex}" title="${ratingTitle}"><img src="${src}" alt="${alt}"></td>
${darkSwatches}
${lightSwatches}
    </tr>`);
  }

  const rows = rowParts.join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Portraits</title>
  <style>
    body { margin: 0; background: #000; color: #ccc; font-family: system-ui, sans-serif; }
    table { border-collapse: collapse; width: 100%; }
    td { padding: 18px; text-align: center; vertical-align: middle; }
    .sq-brand {
      width: 150px;
      height: 150px;
      margin: 0 auto;
      background: ${BRAND_BG};
      box-sizing: border-box;
    }
    .col-swatch img {
      max-width: 100px;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .col-palette-dark {
      width: 48px;
      min-width: 48px;
      height: 48px;
      min-height: 48px;
      padding: 0;
    }
    .col-palette-dark--empty {
      background: #111;
      border: 1px solid #222;
    }
    .col-palette-light {
      width: 48px;
      min-width: 48px;
      height: 48px;
      min-height: 48px;
      padding: 0;
    }
    .col-palette-light--empty {
      background: #222;
      border: 1px solid #333;
    }
  </style>
</head>
<body>
<table>
  <tbody>
${rows}
  </tbody>
</table>
</body>
</html>
`;

  await fs.writeFile(outHtml, html, "utf8");
  console.log(`Wrote ${path.relative(rootDir, outHtml)} (${files.length} images)`);
}

generatePortraits().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
