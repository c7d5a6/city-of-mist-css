import { getColor, getSwatches } from "colorthief";

export function dummyFunction() {
  return "dummy";
}

export async function getDominantColorFromImage(imgElement) {
  return getColor(imgElement);
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

export async function getVibrantColorFromImageUrl(imageUrl) {
  const img = await loadImageFromUrl(imageUrl);
  const swatches = await getSwatches(img);
  const vibrant = swatches.Vibrant?.color ?? swatches.LightVibrant?.color;

  if (vibrant) {
    return {
      hex: vibrant.hex(),
      rgb: vibrant.array(),
      textColor: vibrant.textColor,
    };
  }

  const dominant = await getColor(img);
  return {
    hex: dominant.hex(),
    rgb: dominant.array(),
    textColor: dominant.textColor,
  };
}

function toColorPayload(color) {
  return {
    hex: color.hex(),
    rgb: color.array(),
    textColor: color.textColor,
  };
}

function rgbToHsv([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

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

function getReadableTextColor([r, g, b]) {
  const relativeLuminance = (channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const l =
    0.2126 * relativeLuminance(r) +
    0.7152 * relativeLuminance(g) +
    0.0722 * relativeLuminance(b);

  return l > 0.179 ? "#000000" : "#ffffff";
}

function clampActorUnderlayValue(colorPayload) {
  // 371f37
  const maxValue = rgbToHsv([0x26, 0x16, 0x26]).v;
  const hsv = rgbToHsv(colorPayload.rgb);
  if (hsv.v <= maxValue) return colorPayload;

  const clampedRgb = hsvToRgb({ ...hsv, v: maxValue });
  return {
    hex: rgbToHex(clampedRgb),
    rgb: clampedRgb,
    textColor: getReadableTextColor(clampedRgb),
  };
}

const DARK_MUTED_FALLBACK = {
  hex: "#261626",
  rgb: [0x26, 0x16, 0x26],
  textColor: "#ffffff",
};

function hasValidColorPayload(payload) {
  return Boolean(
    payload &&
      typeof payload.hex === "string" &&
      payload.hex.trim() !== "" &&
      Array.isArray(payload.rgb) &&
      payload.rgb.length === 3 &&
      payload.rgb.every((channel) => Number.isFinite(channel))
  );
}

export async function getSheetUnderlayColorsFromImageUrl(imageUrl) {
  const img = await loadImageFromUrl(imageUrl);
  const swatches = await getSwatches(img);
  const dominant = await getColor(img);

  const vibrantColor =
    swatches.Vibrant?.color ??
    swatches.LightVibrant?.color ??
    swatches.Muted?.color ??
    dominant;

  const darkMutedPayload = swatches.DarkMuted?.color
    ? toColorPayload(swatches.DarkMuted.color)
    : null;
  const darkMuted = hasValidColorPayload(darkMutedPayload)
    ? clampActorUnderlayValue(darkMutedPayload)
    : DARK_MUTED_FALLBACK;

  return {
    vibrant: toColorPayload(vibrantColor),
    darkMuted,
  };
}
