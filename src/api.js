// TheMealDB's free API (test key "1", meant for development and educational use). Open to browsers.

import { summary } from "./recipes.js";

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
  return data.categories.map((c) => ({ name: c.strCategory, thumb: c.strCategoryThumb }));
}

/** Meals in a category, or Indian dishes for the special "Indian" shelf (the API filters by country). */
export async function mealsIn(name, signal) {
  const path = name === "Indian" ? "filter.php?a=India" : `filter.php?c=${encodeURIComponent(name)}`;
  const data = await getJson(path, signal);
  return (data.meals ?? []).map(summary);
}

export async function search(query, signal) {
  const data = await getJson(`search.php?s=${encodeURIComponent(query)}`, signal);
  return (data.meals ?? []).map(summary);
}

export async function meal(id, signal) {
  const data = await getJson(`lookup.php?i=${encodeURIComponent(id)}`, signal);
  return data.meals?.[0] ?? null;
}

/** A random meal; never cached, so each press gives something new. */
export async function random(signal) {
  const response = await fetch(`${BASE}/random.php`, { signal });
  if (!response.ok) throw new Error(`TheMealDB answered ${response.status}`);
  const data = await response.json();
  const found = data.meals?.[0] ?? null;
  if (found) cache.set(`lookup.php?i=${found.idMeal}`, { meals: [found] });
  return found;
}
