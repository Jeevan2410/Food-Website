// Pure recipe logic: shaping TheMealDB data, splitting steps, spotting timers, routes. No DOM, no network.

/** The 20 numbered ingredient and measure fields, as a clean list. */
export function ingredients(meal) {
  const list = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (!name) continue;
    list.push({ name, measure: meal[`strMeasure${i}`]?.trim() ?? "" });
  }
  return list;
}

const STEP_LABEL = /^(?:step\s*\d+[:.)]?|\d+[.)]?)$/i;
const LEADING_NUMBER = /^(?:step\s*\d+\s*[:.)-]?\s*|\d+\s*[.)]\s+)/i;

/**
 * Instructions as steps. TheMealDB mixes styles: paragraphs, "STEP 1" headings on their own line,
 * numbered lines, or one long block. Long blocks are split into pairs of sentences.
 */
export function steps(instructions) {
  if (!instructions) return [];
  const lines = [];
  let headed = false; // the previous line was a "STEP 2" heading, so this one starts a step
  for (const raw of instructions.replace(/\r\n?/g, "\n").split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    if (STEP_LABEL.test(line)) {
      headed = true;
      continue;
    }
    const numbered = LEADING_NUMBER.test(line);
    const text = line.replace(LEADING_NUMBER, "").trim();
    if (!text) continue;
    // Some recipes are hard-wrapped mid-sentence: a line that doesn't end a sentence runs into the
    // next, unless the next one is clearly a new step.
    const previous = lines[lines.length - 1];
    if (previous && !numbered && !headed && !/[.!?:)]["'”’]?$/.test(previous)) lines[lines.length - 1] = `${previous} ${text}`;
    else lines.push(text);
    headed = false;
  }
  if (lines.length > 1) return lines;
  const sentences = (lines[0] ?? "").match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((s) => s.trim()) ?? [];
  const grouped = [];
  for (let i = 0; i < sentences.length; i += 2) grouped.push(sentences.slice(i, i + 2).join(" "));
  return grouped;
}

const UNIT_SECONDS = { h: 3600, m: 60, s: 1 };

/** The first duration mentioned in a step, in seconds: "simmer for 20-25 mins" → 1200. */
export function findTimer(text) {
  const match = /(\d+(?:[.,]\d+)?|½|¼)\s*(?:½)?\s*(?:(?:-|–|to)\s*\d+(?:[.,]\d+)?\s*)?(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i.exec(
    text ?? "",
  );
  if (!match) return null;
  const amount = match[1] === "½" ? 0.5 : match[1] === "¼" ? 0.25 : Number(match[1].replace(",", "."));
  const seconds = Math.round(amount * UNIT_SECONDS[match[2][0].toLowerCase()]);
  return seconds > 0 ? seconds : null;
}

/** "1:05:09", "12:30" or "0:45" for a countdown. */
export function clock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** A readable length for a timer button: 1200 → "20 min", 5400 → "1 h 30 min". */
export function duration(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`;
}

/** "#meal/52772" → meal; "#saved" → saved; "#c/Dessert" → category; otherwise home. */
export function parseRoute(hash) {
  const meal = /^#meal\/(\d+)$/.exec(hash);
  if (meal) return { view: "meal", id: meal[1] };
  if (hash === "#saved") return { view: "saved" };
  const category = /^#c\/([\w-]+)$/.exec(hash);
  if (category) return { view: "category", name: decodeURIComponent(category[1]) };
  return { view: "home" };
}

/** Add or remove a meal summary from favourites, newest first. */
export function toggleSaved(saved, meal) {
  if (saved.some((m) => m.id === meal.id)) return saved.filter((m) => m.id !== meal.id);
  return [{ id: meal.id, name: meal.name, thumb: meal.thumb }, ...saved];
}

/** Favourites read back from storage, keeping only well-formed entries. */
export function parseSaved(json) {
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data.filter((m) => /^\d+$/.test(m?.id) && typeof m.name === "string" && typeof m.thumb === "string");
  } catch {
    return [];
  }
}

/**
 * JeevanKitchen leaves out beef. True for beef, veal, oxtail, suet, tripe and beef cuts such as
 * sirloin or chuck; false for "beef tomatoes" (a tomato) and steaks of other meats or fish.
 */
export function isBeefIngredient(name) {
  const text = String(name).toLowerCase();
  if (/beef\s*tomato/.test(text)) return false;
  if (/\b(beef|veal|oxtail|suet|tripe|brisket|sirloin|chuck)\b/.test(text)) return true;
  return /\bsteak/.test(text) && !/\b(pork|lamb|chicken|turkey|tuna|salmon|fish|cod|swordfish|cauliflower|mushroom|tofu)\b/.test(text);
}

/** Whether a full meal from TheMealDB contains beef, by category, name or ingredients. */
export function hasBeef(meal) {
  if (!meal) return false;
  if (meal.strCategory === "Beef") return true;
  if (/\bbeef\b/i.test(meal.strMeal ?? "")) return true;
  return ingredients(meal).some((item) => isBeefIngredient(item.name));
}

/** For card lists, which only carry an id and a name: the known beef ids plus a name check. */
export const looksBeef = (summaryItem, beefIds) => beefIds.has(summaryItem.id) || /\bbeef\b/i.test(summaryItem.name);

/** Only TheMealDB's own image host is used for pictures. */
export const safeImage = (url) =>
  typeof url === "string" && url.startsWith("https://www.themealdb.com/images/") ? url : null;

/** The short summary used on cards. */
export const summary = (meal) => ({ id: String(meal.idMeal), name: meal.strMeal, thumb: meal.strMealThumb });
