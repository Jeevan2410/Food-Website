import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clock,
  duration,
  findTimer,
  hasBeef,
  ingredients,
  isBeefIngredient,
  looksBeef,
  parseRoute,
  parseSaved,
  safeImage,
  steps,
  summary,
  toggleSaved,
} from "../src/recipes.js";

test("ingredients pairs names with measures and skips blanks", () => {
  const meal = {
    strIngredient1: "Paneer",
    strMeasure1: "200g ",
    strIngredient2: " Peas",
    strMeasure2: null,
    strIngredient3: "",
    strMeasure3: " ",
    strIngredient4: null,
  };
  assert.deepEqual(ingredients(meal), [
    { name: "Paneer", measure: "200g" },
    { name: "Peas", measure: "" },
  ]);
});

test("steps handles paragraphs, STEP headings and numbered lines", () => {
  assert.deepEqual(steps("Boil water.\r\n\r\nAdd pasta."), ["Boil water.", "Add pasta."]);
  assert.deepEqual(steps("STEP 1\r\nChop onions.\r\nSTEP 2\r\nFry them."), ["Chop onions.", "Fry them."]);
  assert.deepEqual(steps("1. Mix flour.\n2) Knead dough.\nStep 3: Rest it."), ["Mix flour.", "Knead dough.", "Rest it."]);
  assert.deepEqual(steps(""), []);
});

test("steps rejoins sentences that were wrapped across lines", () => {
  assert.deepEqual(steps("Apply some oil all over and\r\nkeep it for roasting.\r\nPeel when cool."), [
    "Apply some oil all over and keep it for roasting.",
    "Peel when cool.",
  ]);
  // Numbered steps and STEP headings still start new steps, full stop or not.
  assert.deepEqual(steps("1. Mix flour\n2. Knead dough"), ["Mix flour", "Knead dough"]);
  assert.deepEqual(steps("STEP 1\nChop onions\nSTEP 2\nFry them"), ["Chop onions", "Fry them"]);
});

test("steps splits one long block into pairs of sentences", () => {
  assert.deepEqual(steps("Heat oil. Add cumin. Add onions. Cook until soft"), ["Heat oil. Add cumin.", "Add onions. Cook until soft"]);
});

test("findTimer reads the first duration in a step", () => {
  assert.equal(findTimer("Simmer for 20-25 mins, stirring."), 1200);
  assert.equal(findTimer("Bake for 1 hour until golden."), 3600);
  assert.equal(findTimer("Rest for 1.5 hrs"), 5400);
  assert.equal(findTimer("Leave for 30 seconds"), 30);
  assert.equal(findTimer("Cook for ½ hour"), 1800);
  assert.equal(findTimer("Add 2 cups of rice"), null);
  assert.equal(findTimer(undefined), null);
});

test("clock and duration format times", () => {
  assert.equal(clock(45), "0:45");
  assert.equal(clock(750), "12:30");
  assert.equal(clock(3909), "1:05:09");
  assert.equal(clock(-3), "0:00");
  assert.equal(duration(1200), "20 min");
  assert.equal(duration(5400), "1 h 30 min");
  assert.equal(duration(7200), "2 h");
  assert.equal(duration(30), "30 s");
});

test("parseRoute reads meal, saved and category links", () => {
  assert.deepEqual(parseRoute("#meal/52772"), { view: "meal", id: "52772" });
  assert.deepEqual(parseRoute("#saved"), { view: "saved" });
  assert.deepEqual(parseRoute("#c/Seafood"), { view: "category", name: "Seafood" });
  assert.deepEqual(parseRoute("#meal/abc"), { view: "home" });
});

test("favourites toggle and survive storage", () => {
  const a = { id: "1", name: "Dal", thumb: "https://www.themealdb.com/images/a.jpg" };
  const saved = toggleSaved([], a);
  assert.deepEqual(saved, [a]);
  assert.deepEqual(toggleSaved(saved, a), []);
  assert.deepEqual(parseSaved(JSON.stringify([a, { id: "x", name: 1 }, null])), [a]);
  assert.deepEqual(parseSaved("{oops"), []);
});

test("isBeefIngredient spots beef by any name, but not beef tomatoes or other steaks", () => {
  for (const name of ["Beef", "Minced Beef", "Beef Stock Cubes", "Veal", "Oxtail", "Suet", "Tripe", "Sirloin steak", "Chuck Roast", "Fillet Of Steak", "Flank Steak"]) {
    assert.equal(isBeefIngredient(name), true, name);
  }
  for (const name of ["Beef tomatoes", "Pork Shoulder Steaks", "Tuna Steak", "Cauliflower steak", "Chicken", "Lamb Mince", "Paneer"]) {
    assert.equal(isBeefIngredient(name), false, name);
  }
});

test("hasBeef checks category, name and every ingredient", () => {
  assert.equal(hasBeef({ strCategory: "Beef", strMeal: "Stew" }), true);
  assert.equal(hasBeef({ strCategory: "Pasta", strMeal: "Lasagne", strIngredient1: "Pasta", strIngredient2: "Minced Beef" }), true);
  assert.equal(hasBeef({ strCategory: "Side", strMeal: "Beef Mandi" }), true);
  assert.equal(hasBeef({ strCategory: "Vegetarian", strMeal: "Matar Paneer", strIngredient1: "Paneer", strIngredient2: "Beef tomatoes" }), false);
  assert.equal(hasBeef(null), false);
});

test("looksBeef filters card lists by known id or name", () => {
  const ids = new Set(["52770"]);
  assert.equal(looksBeef({ id: "52770", name: "Lasagne" }, ids), true);
  assert.equal(looksBeef({ id: "1", name: "Beef Wellington" }, ids), true);
  assert.equal(looksBeef({ id: "2", name: "Dal fry" }, ids), false);
});

test("only TheMealDB images are trusted", () => {
  assert.equal(safeImage("https://www.themealdb.com/images/media/meals/x.jpg"), "https://www.themealdb.com/images/media/meals/x.jpg");
  assert.equal(safeImage("javascript:alert(1)"), null);
  assert.equal(safeImage("https://evil.example/x.jpg"), null);
});

test("summary keeps the card fields", () => {
  assert.deepEqual(summary({ idMeal: 52772, strMeal: "Teriyaki Chicken", strMealThumb: "t.jpg", strArea: "Japanese" }), {
    id: "52772",
    name: "Teriyaki Chicken",
    thumb: "t.jpg",
  });
});
