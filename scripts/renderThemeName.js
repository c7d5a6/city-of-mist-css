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
  if (best3 && (bestScore3 < bestScore || best[0].length > 12 || best[1].length > 12)) {
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
  const functionWords = new Set([
    // articles
    "a", "an", "the",
    // common prepositions
    "of", "in", "on", "at", "to", "for", "from", "by", "with", "without",
    "over", "under", "into", "onto", "about", "after", "before", "between",
    "through", "during", "against", "within", "across", "behind", "beyond",
    // pronouns / determiners often used as short fragments
    "i", "me", "my", "mine", "you", "your", "yours", "he", "him", "his",
    "she", "her", "hers", "it", "its", "we", "us", "our", "ours", "they",
    "them", "their", "theirs", "this", "that", "these", "those"
  ]);
  const isFunctionWordOnlySegment = (text) => {
    const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
    if (tokens.length === 0) return false;
    return tokens.every(token => functionWords.has(token));
  };
  const lockedToMinSize = clean.map(isFunctionWordOnlySegment);
  const unlockedIndices = lengths
    .map((_, i) => i)
    .filter(i => !lockedToMinSize[i]);
  const lockedCount = lockedToMinSize.filter(Boolean).length;
  const lockedBudget = lockedCount * minSize;
  const remainingBudget = Math.max(0, maxTotal - lockedBudget);
  const unlockedLengths = unlockedIndices.map(i => lengths[i]);
  const unlockedTotalLength = unlockedLengths.reduce((a, b) => a + b, 0);
  const perSegmentMax = lengths.map(len => Math.ceil((180 / len) * 2.47));
  const maxForIndex = (idx) => Math.min(maxPerItem, perSegmentMax[idx]);
  const longestUnlockedLength = unlockedLengths.length > 0
    ? Math.max(...unlockedLengths)
    : 1;
  const minLargestFont = Math.ceil((170 / longestUnlockedLength) * 2.47);

  // Start with locked segments fixed at min size.
  let sizes = clean.map((_, i) => (lockedToMinSize[i] ? minSize : 0));

  if (unlockedIndices.length > 0 && remainingBudget > 0) {
    // inverse proportional weights (shorter unlocked segment -> bigger)
    const weights = unlockedLengths.map(len => unlockedTotalLength / len);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const unlockedSizes = weights.map(w => (w / weightSum) * remainingBudget);

    // clamp unlocked segment sizes
    for (let i = 0; i < unlockedSizes.length; i++) {
      const globalIdx = unlockedIndices[i];
      unlockedSizes[i] = Math.max(minSize, Math.min(maxForIndex(globalIdx), unlockedSizes[i]));
    }

    // normalize unlocked sizes if they exceed remaining budget
    let unlockedSum = unlockedSizes.reduce((a, b) => a + b, 0);
    if (unlockedSum > remainingBudget && unlockedSum > 0) {
      const scale = remainingBudget / unlockedSum;
      for (let i = 0; i < unlockedSizes.length; i++) {
        unlockedSizes[i] *= scale;
      }
    }

    // Move unlocked sizes back into global size array.
    for (let i = 0; i < unlockedIndices.length; i++) {
      sizes[unlockedIndices[i]] = unlockedSizes[i];
    }
  }

  // Ensure visual contrast between split parts:
  // - 2 parts: must have at least 1.5:1
  // - 3+ parts: at least one pair must reach 1.5:1
  const MIN_RATIO = 1.5;
  const enforceRatioWithinPair = (arr, bigIdx, smallIdx) => {
    const pairTotal = arr[bigIdx] + arr[smallIdx];
    let small = pairTotal / (1 + MIN_RATIO);
    let big = pairTotal - small;
    const maxBig = maxForIndex(bigIdx);
    const maxSmall = maxForIndex(smallIdx);

    // Respect min/max bounds while preserving pair total.
    if (big > maxBig) {
      big = maxBig;
      small = pairTotal - big;
    }
    if (small > maxSmall) {
      small = maxSmall;
      big = pairTotal - small;
    }
    if (small < minSize) {
      small = minSize;
      big = pairTotal - small;
    }
    if (big < minSize) {
      big = minSize;
      small = pairTotal - big;
    }

    // Final guard for bounds.
    small = Math.max(minSize, Math.min(maxSmall, small));
    big = Math.max(minSize, Math.min(maxBig, big));

    arr[bigIdx] = big;
    arr[smallIdx] = small;
  };

  const ratio = (a, b) => (a > b ? a / b : b / a);

  if (unlockedIndices.length === 2) {
    const a = unlockedIndices[0];
    const b = unlockedIndices[1];
    const bigIdx = sizes[a] >= sizes[b] ? a : b;
    const resolvedSmallIdx = bigIdx === a ? b : a;
    if (ratio(sizes[a], sizes[b]) < MIN_RATIO) {
      enforceRatioWithinPair(sizes, bigIdx, resolvedSmallIdx);
    }
  } else if (unlockedIndices.length >= 3) {
    let hasPairWithMinRatio = false;
    for (let i = 0; i < unlockedIndices.length && !hasPairWithMinRatio; i++) {
      for (let j = i + 1; j < unlockedIndices.length; j++) {
        const idxI = unlockedIndices[i];
        const idxJ = unlockedIndices[j];
        if (ratio(sizes[idxI], sizes[idxJ]) >= MIN_RATIO) {
          hasPairWithMinRatio = true;
          break;
        }
      }
    }

    if (!hasPairWithMinRatio) {
      let bigIdx = unlockedIndices[0];
      let smallIdx = unlockedIndices[0];
      for (let i = 1; i < unlockedIndices.length; i++) {
        const idx = unlockedIndices[i];
        if (sizes[idx] > sizes[bigIdx]) bigIdx = idx;
        if (sizes[idx] < sizes[smallIdx]) smallIdx = idx;
      }
      if (bigIdx !== smallIdx) {
        enforceRatioWithinPair(sizes, bigIdx, smallIdx);
      }
    }
  }

  // Keep locked segments fixed at minimum after all unlocked math.
  for (let i = 0; i < sizes.length; i++) {
    if (lockedToMinSize[i]) {
      sizes[i] = minSize;
    }
  }

  // Ensure largest non-function segment is never below formula threshold.
  const enforceMinLargestFont = (arr, minLargest, eligibleIndices) => {
    if (eligibleIndices.length === 0) return -1;
    let largestIdx = eligibleIndices[0];
    for (let i = 1; i < eligibleIndices.length; i++) {
      const idx = eligibleIndices[i];
      if (arr[idx] > arr[largestIdx]) largestIdx = idx;
    }

    if (arr[largestIdx] >= minLargest) return largestIdx;

    let deficit = minLargest - arr[largestIdx];
    for (let i = 0; i < arr.length && deficit > 0; i++) {
      if (i === largestIdx || lockedToMinSize[i]) continue;
      const reducible = Math.max(0, arr[i] - minSize);
      const delta = Math.min(reducible, deficit);
      arr[i] -= delta;
      deficit -= delta;
    }

    arr[largestIdx] = Math.min(maxForIndex(largestIdx), minLargest - deficit);
    return largestIdx;
  };

  const protectedLargestIdx = enforceMinLargestFont(
    sizes,
    minLargestFont,
    unlockedIndices
  );

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
      const localMinSize = lockedToMinSize[i]
        ? minSize
        : (i === protectedLargestIdx ? minLargestFont : minSize);

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
