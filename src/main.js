import { getColor, getPalette } from "colorthief";

const PALETTE_COLOR_COUNT = 8;
const PALETTE_SAMPLE_QUALITY = 1;

const DARK_COLOR_LUMINANCE_THRESHOLD = 0.051;
const LIGHT_COLOR_LUMINANCE_THRESHOLD = 0.2;

const UNDERLAY_CAP_RGB = [0x26, 0x16, 0x26];
const VIBRANT_FLOOR_RGB = [0xa4, 0x41, 0x46];
const BRAND_PURPLE_RGB = [0x4c, 0x2b, 0x51];

const DARK_MUTED_FALLBACK = {
  hex: "#261626",
  rgb: [0x26, 0x16, 0x26],
  textColor: "#ffffff",
  proportion: 1,
};

const LIGHT_VIVID_FALLBACK = {
  hex: "#e8e0dc",
  rgb: [232, 224, 220],
  textColor: "#000000",
  proportion: 1,
};

function mergeSampleOpts(extractionOptions = {}) {
  return { quality: PALETTE_SAMPLE_QUALITY, worker: true, ...extractionOptions };
}

export function dummyFunction() {
  return "dummy";
}

export async function getDominantColorFromImage(imgElement, extractionOptions = {}) {
  return getColor(imgElement, mergeSampleOpts(extractionOptions));
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function toColorPayload(color) {
  return {
    hex: color.hex(),
    rgb: color.array(),
    textColor: color.textColor,
    proportion: color.proportion,
  };
}

/**
 * @param {import("colorthief").ImageSource} source
 * @param {import("colorthief").ExtractionOptions} [extractionOptions]
 */
export async function extractPaletteFromImage(source, extractionOptions = {}) {
  const palette = await getPalette(source, {
    ...mergeSampleOpts(extractionOptions),
    colorCount: PALETTE_COLOR_COUNT,
  });
  if (!palette?.length) return [];
  return palette.map(toColorPayload);
}

async function extractPaletteWithFallback(source, extractionOptions = {}) {
  let palette = await extractPaletteFromImage(source, extractionOptions);
  if (!palette.length) {
    const dominant = await getColor(source, mergeSampleOpts(extractionOptions));
    if (dominant) palette = [toColorPayload(dominant)];
  }
  return palette;
}

function relativeLuminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function uniquePaletteByHex(palette) {
  const seen = new Set();
  return palette.filter((p) => {
    const key = p.hex.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitDarkLightFromPalette(palette) {
  const unique = uniquePaletteByHex(palette);
  return {
    darks: unique.filter(
      (p) => relativeLuminance(p.rgb) <= LIGHT_COLOR_LUMINANCE_THRESHOLD
    ),
    lights: unique.filter(
      (p) => relativeLuminance(p.rgb) > DARK_COLOR_LUMINANCE_THRESHOLD
    ),
  };
}

export function getDarkColorsFromPalette(palette) {
  if (!palette?.length) return [];
  const { darks } = splitDarkLightFromPalette(palette);
  return [...darks].sort(
    (a, b) => relativeLuminance(a.rgb) - relativeLuminance(b.rgb)
  );
}

export function getLightColorsFromPalette(palette) {
  if (!palette?.length) return [];
  const { lights } = splitDarkLightFromPalette(palette);
  return [...lights].sort(
    (a, b) => relativeLuminance(b.rgb) - relativeLuminance(a.rgb)
  );
}

/** Normalized RGB channels, max/min, and chroma (max − min). */
function rgbChromaCoords([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  return { rn, gn, bn, max, min, chroma: max - min };
}

function rgbToHsl(rgb) {
  const { rn, gn, bn, max, min, chroma: d } = rgbChromaCoords(rgb);
  const l = (max + min) / 2;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const denom = 1 - Math.abs(2 * l - 1);
  const s = denom === 0 || d === 0 ? 0 : d / denom;
  return { h, s, l };
}

const BRAND_HSL = rgbToHsl(BRAND_PURPLE_RGB);

function hueDistanceDegrees(h1, h2) {
  const diff = Math.abs(h1 - h2) % 360;
  return Math.min(diff, 360 - diff) / 360;
}

/**
 * HSL-based score × ColorThief proportions:
 * `hslCore * proportionDark * sqrt(proportionLight)`.
 */
export function rateDarkLightPair(darkPayload, lightPayload) {
  const hslDark = rgbToHsl(darkPayload.rgb);
  const hslLight = rgbToHsl(lightPayload.rgb);
  if (hslLight.l < hslDark.l) return 0;

  const satLightSqrt = Math.sqrt(hslLight.s);
  const lLightSqrt = Math.sqrt(hslLight.l);
  const hueDarkBrand = hueDistanceDegrees(hslDark.h, BRAND_HSL.h);
  const hueDarkLight = hueDistanceDegrees(hslDark.h, hslLight.h);
  const hueTerm = Math.sqrt(hueDarkBrand ** 2 + hueDarkLight ** 2);
  const valueDist = Math.sqrt(Math.abs(hslLight.l - hslDark.l));

  const hslCore = satLightSqrt * hueTerm * Math.sqrt(valueDist * lLightSqrt);
  const pctDark = darkPayload.proportion ?? 1;
  const pctLight = lightPayload.proportion ?? 1;

  return hslCore * pctDark * Math.sqrt(pctLight);
}

export async function getBestDarkLightPairFromImage(source, extractionOptions = {}) {
  const palette = await extractPaletteWithFallback(source, extractionOptions);
  let { darks, lights } = splitDarkLightFromPalette(palette);
  if (darks.length === 0) darks = [DARK_MUTED_FALLBACK];
  if (lights.length === 0) lights = [LIGHT_VIVID_FALLBACK];

  let bestDark = darks[0];
  let bestLight = lights[0];
  let bestRating = rateDarkLightPair(bestDark, bestLight);

  for (const d of darks) {
    for (const l of lights) {
      const rating = rateDarkLightPair(d, l);
      if (rating > bestRating) {
        bestRating = rating;
        bestDark = d;
        bestLight = l;
      }
    }
  }

  return { dark: bestDark, light: bestLight, rating: bestRating, palette };
}

function rgbToHsv(rgb) {
  const { rn, gn, bn, max, min, chroma: delta } = rgbChromaCoords(rgb);
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

async function bestPairFromImageUrl(imageUrl) {
  const img = await loadImageFromUrl(imageUrl);
  return getBestDarkLightPairFromImage(img);
}

export async function getVibrantColorFromImageUrl(imageUrl) {
  const { light } = await bestPairFromImageUrl(imageUrl);
  return clampActorVibrantValue(light);
}

function hsvToRgb({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h >= 0 && h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return [
    Math.round((rp + m) * 255),
    Math.round((gp + m) * 255),
    Math.round((bp + m) * 255),
  ];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getReadableTextColor(rgb) {
  return relativeLuminance(rgb) > DARK_COLOR_LUMINANCE_THRESHOLD
    ? "#000000"
    : "#ffffff";
}

function payloadFromClampedRgb(rgb) {
  return {
    hex: rgbToHex(rgb),
    rgb,
    textColor: getReadableTextColor(rgb),
  };
}

/** Clamp HSV V: `ceiling` caps bright underlays; `floor` lifts dim vibrants. */
function clampHsvValue(colorPayload, refRgb, ceiling) {
  const limit = rgbToHsv(refRgb).v;
  const hsv = rgbToHsv(colorPayload.rgb);
  const nextV = ceiling ? Math.min(hsv.v, limit) : Math.max(hsv.v, limit);
  if (nextV === hsv.v) return colorPayload;
  return payloadFromClampedRgb(hsvToRgb({ ...hsv, v: nextV }));
}

export function clampActorUnderlayValue(colorPayload) {
  return clampHsvValue(colorPayload, UNDERLAY_CAP_RGB, true);
}

export function clampActorVibrantValue(colorPayload) {
  return clampHsvValue(colorPayload, VIBRANT_FLOOR_RGB, false);
}

export async function getSheetUnderlayColorsFromImageUrl(imageUrl) {
  const img = await loadImageFromUrl(imageUrl);
  return getSheetUnderlayColorsFromImageElement(img);
}

export async function getSheetUnderlayColorsFromImageElement(
  imgElement,
  extractionOptions = {}
) {
  const { dark, light } = await getBestDarkLightPairFromImage(
    imgElement,
    extractionOptions
  );
  return {
    vibrant: clampActorVibrantValue(light),
    darkMuted: clampActorUnderlayValue(dark),
  };
}
