// TheMealDB's free API (test key "1", meant for development and educational use). Open to browsers.
// JeevanKitchen leaves out beef, so every list and lookup passes through the beef filters here.

import { BEEF_IDS } from "./beef-ids.js";
import { hasBeef, looksBeef, summary } from "./recipes.js";

const BASE = "https://www.themealdb.com/api/json/v1/1";
const cache = new Map();

async function getJson(path, signal) {
  if (cache.has(path)) return cache.get(path);
  const response = await fetch(`${BASE}/${path}`, { signal });
  if (!response.ok) throw new Error(`TheMealDB answered ${response.status}`);
  const data = await response.json();
  cache.set(path, data);
  return data;
}

export async function categories(signal) {
  const data = await getJson("categories.php", signal);
  return data.categories.filter((c) => c.strCategory !== "Beef").map((c) => ({ name: c.strCategory, thumb: c.strCategoryThumb }));
}

/** Meals in a category, or Indian dishes for the special "Indian" shelf (the API filters by country). */
export async function mealsIn(name, signal) {
  if (name === "Beef") return [];
  const path = name === "Indian" ? "filter.php?a=India" : `filter.php?c=${encodeURIComponent(name)}`;
  const data = await getJson(path, signal);
  return (data.meals ?? []).map(summary).filter((meal) => !looksBeef(meal, BEEF_IDS));
}

/** Search returns full recipes, so the ingredients themselves are checked. */
export async function search(query, signal) {
  const data = await getJson(`search.php?s=${encodeURIComponent(query)}`, signal);
  return (data.meals ?? []).filter((meal) => !hasBeef(meal)).map(summary);
}

/** A recipe by id, or null if it doesn't exist or contains beef. */
export async function meal(id, signal) {
  const data = await getJson(`lookup.php?i=${encodeURIComponent(id)}`, signal);
  const found = data.meals?.[0] ?? null;
  return found && !hasBeef(found) ? found : null;
}

/** A random meal without beef; never cached, so each press gives something new. */
export async function random(signal) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`${BASE}/random.php`, { signal });
    if (!response.ok) throw new Error(`TheMealDB answered ${response.status}`);
    const data = await response.json();
    const found = data.meals?.[0] ?? null;
    if (!found || hasBeef(found)) continue;
    cache.set(`lookup.php?i=${found.idMeal}`, { meals: [found] });
    return found;
  }
  return null;
}

/** Saved favourites, minus anything with beef (in case one was saved before beef was removed). */
export const withoutBeef = (meals) => meals.filter((meal) => !looksBeef(meal, BEEF_IDS));
