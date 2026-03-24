console.log("renderTHeme name start")

function getBreakIndexes(words) {
  const breaks = [];

  for (let i = 0; i < words.length; i++) {
    const current = words[i]?.trim();

    // Rule: skip empty current
    if (!current) continue;

    // Find next non-empty word
    let j = i + 1;
    while (j < words.length && !words[j]?.trim()) {
      j++;
    }

    // If no next non-empty word → stop entirely
    if (j >= words.length) break;

    const next = words[j].trim();

    const len1 = current.length;
    const len2 = next.length;

    if (len1 <= 1) continue;

    // Rule 2
    if (len1 <= 3 && len2 <= 4) continue;

    // Rule 3
    if (len1 <= 4 && len2 <= 3) continue;

    // Otherwise allow break after index i
    breaks.push(i);
  }

  return breaks;
}

function splitBalancedText(text) {
  const words = text.trim().split(/\s+/);
  const breakpoints = getBreakIndexes(words);

  // No breakpoints → return whole text
  if (breakpoints.length === 0) {
    return [text.trim()];
  }

  let best = null;
  let bestScore = Infinity;

  // --- TRY 2 PARTS ---
  for (let i = 0; i < breakpoints.length; i++) {
    const bp = breakpoints[i];

    const part1 = words.slice(0, bp + 1).join(' ');
    const part2 = words.slice(bp + 1).join(' ');

    const score = Math.abs(part1.length - part2.length);

    if (score < bestScore) {
      bestScore = score;
      best = [part1, part2];
    }
  }

  // If only 1 breakpoint → return best 2-part split
  if (breakpoints.length === 1) {
    return best;
  }

  // --- TRY 3 PARTS ---
  let best3 = null;
  let bestScore3 = Infinity;

  for (let i = 0; i < breakpoints.length; i++) {
    for (let j = i + 1; j < breakpoints.length; j++) {
      const bp1 = breakpoints[i];
      const bp2 = breakpoints[j];

      const part1 = words.slice(0, bp1 + 1).join(' ');
      const part2 = words.slice(bp1 + 1, bp2 + 1).join(' ');
      const part3 = words.slice(bp2 + 1).join(' ');

      const len1 = part1.length;
      const len2 = part2.length;
      const len3 = part3.length;

      // measure balance (max difference between parts)
      const score =
        (Math.abs(len1 - len2) +
        Math.abs(len2 - len3) +
        Math.abs(len1 - len3)) / 3.0;

      if (score < bestScore3) {
        bestScore3 = score;
        best3 = [part1, part2, part3];
      }
    }
  }

  // Choose better between 2-part and 3-part
  if (best3 && (bestScore3 < bestScore || best[0].length > 14 || best[1].length > 14)) {
    return best3;
  }

  return best;
}

function renderTexts(output, texts) {
  output.innerHTML = '';

  // --- CLEAN INPUT ---
  const clean = texts.map(t => t.trim()).filter(t => t.length > 0);
  if (clean.length === 0) return;

  // --- ALIGNMENT RULES ---
  let align = 'center';

  if (clean.length === 1) {
    align = 'center';
  } else if (
    clean.some(t => t.length <= 3) ||
    clean.some(t => /\s/.test(t))
  ) {
    align = 'flex-start';
  } else {
    const totalLen = clean.reduce((sum, t) => sum + t.length, 0);
    align = totalLen % 2 === 0 ? 'flex-start' : 'center';
  }

  output.style.display = 'flex';
  output.style.flexDirection = 'column';
  output.style.alignItems = align;

  // --- FONT SIZE CALCULATION ---
  const maxPerItem = clean.length === 1 ? 60 : 100;
  const minSize = 18;
  const maxTotal = clean.length > 2? 90:80;

  const lengths = clean.map(t => t.length);
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  const longestSegmentLength = Math.max(...lengths);
  const minLargestFont = Math.ceil((170 / longestSegmentLength) * 2.47);

  // inverse proportional weights (shorter → bigger)
  const weights = lengths.map(len => totalLength / len);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  let sizes = weights.map(w => (w / weightSum) * maxTotal);

  // clamp to min/max
  sizes = sizes.map(s => Math.max(minSize, Math.min(maxPerItem, s)));

  // normalize again if we exceeded total
  let sizeSum = sizes.reduce((a, b) => a + b, 0);
  if (sizeSum > maxTotal) {
    const scale = maxTotal / sizeSum;
    sizes = sizes.map(s => s * scale);
  }

  // Ensure visual contrast between split parts:
  // - 2 parts: must have at least 1.5:1
  // - 3+ parts: at least one pair must reach 1.5:1
  const MIN_RATIO = 1.5;
  const enforceRatioWithinPair = (arr, bigIdx, smallIdx) => {
    const pairTotal = arr[bigIdx] + arr[smallIdx];
    let small = pairTotal / (1 + MIN_RATIO);
    let big = pairTotal - small;

    // Respect min/max bounds while preserving pair total.
    if (big > maxPerItem) {
      big = maxPerItem;
      small = pairTotal - big;
    }
    if (small < minSize) {
      small = minSize;
      big = pairTotal - small;
    }

    // Final guard for bounds.
    small = Math.max(minSize, Math.min(maxPerItem, small));
    big = Math.max(minSize, Math.min(maxPerItem, big));

    arr[bigIdx] = big;
    arr[smallIdx] = small;
  };

  const ratio = (a, b) => (a > b ? a / b : b / a);

  if (sizes.length === 2) {
    const bigIdx = sizes[0] >= sizes[1] ? 0 : 1;
    const smallIdx = bigIdx === 0 ? 1 : 0;
    if (ratio(sizes[0], sizes[1]) < MIN_RATIO) {
      enforceRatioWithinPair(sizes, bigIdx, smallIdx);
    }
  } else if (sizes.length >= 3) {
    let hasPairWithMinRatio = false;
    for (let i = 0; i < sizes.length && !hasPairWithMinRatio; i++) {
      for (let j = i + 1; j < sizes.length; j++) {
        if (ratio(sizes[i], sizes[j]) >= MIN_RATIO) {
          hasPairWithMinRatio = true;
          break;
        }
      }
    }

    if (!hasPairWithMinRatio) {
      let bigIdx = 0;
      let smallIdx = 0;
      for (let i = 1; i < sizes.length; i++) {
        if (sizes[i] > sizes[bigIdx]) bigIdx = i;
        if (sizes[i] < sizes[smallIdx]) smallIdx = i;
      }
      if (bigIdx !== smallIdx) {
        enforceRatioWithinPair(sizes, bigIdx, smallIdx);
      }
    }
  }

  // Ensure largest font is never below the requested formula threshold.
  const enforceMinLargestFont = (arr, minLargest) => {
    let largestIdx = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > arr[largestIdx]) largestIdx = i;
    }

    if (arr[largestIdx] >= minLargest) return largestIdx;

    let deficit = minLargest - arr[largestIdx];
    for (let i = 0; i < arr.length && deficit > 0; i++) {
      if (i === largestIdx) continue;
      const reducible = Math.max(0, arr[i] - minSize);
      const delta = Math.min(reducible, deficit);
      arr[i] -= delta;
      deficit -= delta;
    }

    arr[largestIdx] = minLargest - deficit;
    return largestIdx;
  };

  const protectedLargestIdx = enforceMinLargestFont(sizes, minLargestFont);

  // --- CREATE SPANS ---
  clean.forEach((text, i) => {
    const span = document.createElement('span');

    span.textContent = text;
    // span.style.display = 'block'; // ensures new line
    span.style.fontSize = sizes[i] + 'px';
    // span.style.whiteSpace = 'nowrap';

    output.appendChild(span);
  });

  // --- FIT TO WIDTH (shrink if overflow) ---
  requestAnimationFrame(() => {
    const containerWidth = output.clientWidth;

    const spans = [...output.children];

    spans.forEach((span, i) => {
      let fontSize = parseFloat(span.style.fontSize);
      const localMinSize = i === protectedLargestIdx ? minLargestFont : minSize;

      while (span.scrollWidth > containerWidth && fontSize > localMinSize) {
        fontSize -= 1;
        span.style.fontSize = fontSize + 'px';
      }
    });
  });
}
	
  const cards = document.querySelectorAll('.card');

  cards.forEach(card => {
    const textarea = card.querySelector('textarea');
    const output = card.querySelector('.output');

    textarea.addEventListener('input', () => {
      // Split text into words (by spaces)
      const words = splitBalancedText(textarea.value);
	  console.log(words)

      renderTexts(output, words);
    });
  });

Hooks.on("renderCityCharacterSheet", (app, html) => {
  const isLocked = !!app.actor?.system?.locked;
  if (!isLocked) return;

  console.log("renderCityCharacter")

  html.find("textarea.theme-name-input:disabled").each((_, textarea) => {
    const $ta = $(textarea);

    // Avoid duplicating if sheet re-renders
    const existing = $ta.siblings(".theme-name-rendered");
    if (existing.length) existing.remove();

    const rawText = ($ta.val() ?? "").toString().trim();
    const parts = splitBalancedText(rawText);

    // Keep original element in DOM for form consistency, but hide it
    $ta.css("display", "none");

    // Inject replacement display node with same core classes
    const $display = $(
      `<div class="theme-name-rendered theme-name-input borderless"></div>`
    );

    // Mirror textarea-like layout behavior
    $display.css({
      display: "flex",
      flexDirection: "column",
      width: "100%",
      minHeight: $ta.outerHeight() + "px",
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      pointerEvents: "none" // locked visual only
    });

    // Render with your existing function
    renderTexts($display[0], parts);

    // Put it right after textarea
    $ta.after($display);
  });
});
