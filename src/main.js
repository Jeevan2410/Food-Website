import * as api from "./api.js";
import { clock, duration, findTimer, ingredients, parseRoute, parseSaved, safeImage, steps, toggleSaved } from "./recipes.js";

const SAVED_KEY = "kitchen:saved";
const $ = (selector, scope = document) => scope.querySelector(selector);
const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const recipeDialog = $("#recipe");
const cookDialog = $("#cook");

const state = {
  category: "Indian",
  saved: (() => {
    try {
      return api.withoutBeef(parseSaved(localStorage.getItem(SAVED_KEY)));
    } catch {
      return [];
    }
  })(),
  meal: null, // the full meal open in the recipe dialog
  steps: [],
  step: 0,
  heroMeal: null,
};

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "style") node.style.cssText = value;
    else if (key in node && !key.includes("-")) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

const announce = (message) => {
  $("#announce").textContent = message;
};

/* ---------- cards and grids ---------- */

function card(meal, index) {
  const thumb = safeImage(meal.thumb);
  return el(
    "li",
    { style: `--i:${Math.min(index, 12)}` },
    el(
      "button",
      { class: "card", type: "button", "data-id": meal.id, "aria-label": meal.name },
      thumb
        ? el("img", { src: `${thumb}/medium`, alt: "", loading: index < 8 ? "eager" : "lazy", decoding: "async", width: 350, height: 350 })
        : el("span", { class: "img-missing" }),
      el("span", { class: "card-name" }, meal.name),
      state.saved.some((s) => s.id === meal.id) ? el("span", { class: "card-heart", "aria-label": "Saved" }, "♥") : null,
    ),
  );
}

function fillGrid(grid, meals) {
  grid.replaceChildren(...meals.map(card));
  grid.classList.remove("in");
  void grid.offsetWidth;
  grid.classList.add("in");
}

function skeleton(grid, count = 8) {
  grid.replaceChildren(...Array.from({ length: count }, () => el("li", { class: "skeleton" })));
}

/* ---------- hero: tonight's plate ---------- */

function setHero(meal) {
  state.heroMeal = meal;
  const image = safeImage(meal.strMealThumb);
  const plate = $("#plate-img");
  if (image) plate.src = `${image}/large`;
  $("#hero-name").textContent = meal.strMeal;
  $("#hero-meta").textContent = [meal.strCategory, meal.strArea].filter(Boolean).join(" · ");
  // Up to six ingredients orbit the plate.
  const items = ingredients(meal).slice(0, 6);
  $("#orbit").replaceChildren(
    ...items.map((item, i) => el("span", { class: "orbit-chip", style: `--a:${(360 / items.length) * i}deg` }, el("span", {}, item.name))),
  );
  const hero = $(".hero-card");
  hero.classList.remove("swap");
  void hero.offsetWidth;
  hero.classList.add("swap");
}

async function surprise() {
  const button = $("#surprise");
  button.disabled = true;
  $(".plate").classList.add("spin");
  try {
    const [meal] = await Promise.all([api.random(), new Promise((r) => setTimeout(r, reduceMotion.matches ? 0 : 700))]);
    if (meal) setHero(meal);
    announce(meal ? `Tonight: ${meal.strMeal}` : "");
  } catch {
    announce("Couldn't reach the recipe service.");
  } finally {
    $(".plate").classList.remove("spin");
    button.disabled = false;
  }
}

$("#surprise").addEventListener("click", surprise);
$("#hero-open").addEventListener("click", () => state.heroMeal && goToMeal(state.heroMeal.idMeal));

/* ---------- categories ---------- */

async function renderCategories() {
  let list = [];
  try {
    list = await api.categories();
  } catch {
    $("#load-error").hidden = false;
  }
  const all = [{ name: "Indian", thumb: null }, ...list];
  $("#categories").replaceChildren(
    ...all.map((c) =>
      el(
        "a",
        { class: "category", href: `#c/${encodeURIComponent(c.name)}`, "data-name": c.name },
        safeImage(c.thumb) ? el("img", { src: c.thumb, alt: "", width: 48, height: 30, loading: "lazy" }) : el("span", { class: "flag", "aria-hidden": "true" }, "🍛"),
        el("span", {}, c.name),
      ),
    ),
  );
  markCategory();
}

function markCategory() {
  for (const link of document.querySelectorAll(".category")) {
    if (link.dataset.name === state.category) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
  // Centre the current category in its strip, sideways only, so the page itself never jumps.
  const current = $(".category[aria-current]");
  const strip = $("#categories");
  if (current) {
    strip.scrollTo({
      left: current.offsetLeft - strip.clientWidth / 2 + current.clientWidth / 2,
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  }
}

let shelfRequest = null;
async function showCategory(requested) {
  // There is no beef shelf; an old #c/Beef link lands on the Indian kitchen instead.
  const name = requested === "Beef" ? "Indian" : requested;
  state.category = name;
  markCategory();
  $("#shelf-title").textContent = name === "Indian" ? "Indian kitchen" : name;
  const grid = $("#grid");
  skeleton(grid);
  shelfRequest?.abort();
  const request = new AbortController();
  shelfRequest = request;
  try {
    const meals = await api.mealsIn(name, request.signal);
    if (request !== shelfRequest) return;
    $("#shelf-count").textContent = `${meals.length} recipes`;
    fillGrid(grid, meals);
  } catch (error) {
    if (error.name !== "AbortError") grid.replaceChildren(el("li", { class: "empty" }, "Couldn't load recipes. Check your connection."));
  }
}

/* ---------- search ---------- */

let searchTimer = 0;
$("#search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const query = event.target.value.trim();
  searchTimer = setTimeout(async () => {
    if (query.length < 2) {
      showView("home");
      return;
    }
    showView("results");
    $("#results-title").textContent = `Recipes with “${query}”`;
    skeleton($("#results-grid"), 4);
    try {
      const meals = await api.search(query);
      if ($("#search").value.trim() !== query) return;
      $("#results-title").textContent = meals.length ? `Recipes with “${query}”` : `No recipes with “${query}” yet`;
      fillGrid($("#results-grid"), meals);
      announce(`${meals.length} recipes found`);
    } catch {
      $("#results-title").textContent = "Search failed. Check your connection.";
    }
  }, 300);
});

/* ---------- recipe dialog ---------- */

function goToMeal(id) {
  history.pushState({ modal: true }, "", `#meal/${id}`);
  route();
}

function isSaved(id) {
  return state.saved.some((s) => s.id === String(id));
}

function paintSaveButton() {
  const saved = state.meal && isSaved(state.meal.idMeal);
  const button = $("#r-save");
  button.setAttribute("aria-pressed", String(Boolean(saved)));
  button.lastChild.textContent = saved ? "Saved" : "Save";
}

async function openMeal(id) {
  if (recipeDialog.open && state.meal?.idMeal === id) return;
  $("#r-name").textContent = "Loading…";
  $("#r-tags").replaceChildren();
  $("#r-ingredients").replaceChildren(...Array.from({ length: 6 }, () => el("li", { class: "skeleton" })));
  $("#r-steps").replaceChildren();
  $("#r-hero").style.backgroundImage = "";
  state.meal = null;
  $("#r-cook").disabled = true;
  $("#r-save").disabled = true;
  if (!recipeDialog.open) {
    recipeDialog.showModal();
    root.classList.add("modal-open");
  }
  try {
    const meal = await api.meal(id);
    if (meal) {
      renderMeal(meal);
      return;
    }
    // Missing, or a beef recipe from an old link.
    $("#r-name").textContent = "This recipe isn't on JeevanKitchen.";
  } catch {
    $("#r-name").textContent = "Couldn't load this recipe.";
  }
  $("#r-ingredients").replaceChildren();
}

function renderMeal(meal) {
  state.meal = meal;
  state.steps = steps(meal.strInstructions);
  const image = safeImage(meal.strMealThumb);
  $("#r-hero").style.backgroundImage = image ? `url("${image}/large")` : "";
  $("#r-name").textContent = meal.strMeal;
  $("#r-tags").replaceChildren(
    ...[meal.strCategory, meal.strArea, ...(meal.strTags ?? "").split(",")]
      .map((t) => t?.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((tag) => el("li", {}, tag)),
  );
  $("#r-ingredients").replaceChildren(
    ...ingredients(meal).map((item, i) =>
      el(
        "li",
        { style: `--i:${Math.min(i, 14)}` },
        el(
          "label",
          {},
          el("input", { type: "checkbox" }),
          el("span", { class: "tick", "aria-hidden": "true" }),
          el("span", { class: "ing-name" }, item.name),
          item.measure ? el("span", { class: "ing-measure" }, item.measure) : null,
        ),
      ),
    ),
  );
  $("#r-steps").replaceChildren(
    ...state.steps.map((text, i) => {
      const timer = findTimer(text);
      return el(
        "li",
        { style: `--i:${Math.min(i, 12)}` },
        el("span", { class: "step-no" }, String(i + 1)),
        el("p", {}, text),
        timer ? el("span", { class: "timer-hint" }, `⏱ ${duration(timer)}`) : null,
      );
    }),
  );
  const video = /^https:\/\/(www\.)?youtube\.com\//.test(meal.strYoutube ?? "") ? meal.strYoutube : null;
  $("#r-video").hidden = !video;
  if (video) $("#r-video").href = video;
  $("#r-cook").disabled = state.steps.length === 0;
  $("#r-save").disabled = false;
  paintSaveButton();
  recipeDialog.scrollTop = 0;
}

$("#r-save").addEventListener("click", () => {
  const meal = state.meal;
  if (!meal) return;
  state.saved = toggleSaved(state.saved, { id: String(meal.idMeal), name: meal.strMeal, thumb: meal.strMealThumb });
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
  } catch {
    // Storage blocked: favourites last for this visit.
  }
  paintSaveButton();
  const heart = $("#r-save .heart");
  heart.classList.remove("beat");
  void heart.offsetWidth;
  heart.classList.add("beat");
  $("#saved-count").textContent = state.saved.length ? String(state.saved.length) : "";
  announce(isSaved(meal.idMeal) ? `Saved ${meal.strMeal}` : `Removed ${meal.strMeal}`);
});

$("#r-close").addEventListener("click", () => recipeDialog.close());
recipeDialog.addEventListener("click", (event) => {
  if (event.target === recipeDialog) recipeDialog.close();
});
recipeDialog.addEventListener("close", () => {
  root.classList.remove("modal-open");
  if (parseRoute(location.hash).view === "meal") {
    if (history.state?.modal) history.back();
    else history.replaceState(null, "", location.pathname + location.search);
  }
});

/* ---------- cook mode ---------- */

let wakeLock = null;
const timer = { endsAt: 0, total: 0, label: "", frame: 0 };

async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    wakeLock = null; // not allowed (battery saver) or unsupported: cooking still works
  }
}

function renderStep() {
  const total = state.steps.length;
  const text = state.steps[state.step] ?? "";
  $("#c-count").textContent = `Step ${state.step + 1} of ${total}`;
  $("#c-progress").style.transform = `scaleX(${(state.step + 1) / total})`;
  $("#c-text").textContent = text;
  // Long steps get smaller type so the whole step fits without hunting for the buttons.
  $("#c-text").dataset.size = text.length > 420 ? "long" : text.length > 220 ? "medium" : "short";
  const seconds = findTimer(text);
  const startTimer = $("#c-timer");
  startTimer.hidden = !seconds;
  if (seconds) {
    startTimer.textContent = `Start a ${duration(seconds)} timer`;
    startTimer.dataset.seconds = String(seconds);
  }
  $("#c-prev").disabled = state.step === 0;
  $("#c-next").textContent = state.step === total - 1 ? "Done" : "Next";
  const body = $(".cook-step");
  body.classList.remove("enter-next", "enter-prev");
  void body.offsetWidth;
  body.classList.add(body.dataset.direction === "back" ? "enter-prev" : "enter-next");
}

function go(step) {
  if (step >= state.steps.length) {
    cookDialog.close();
    announce("Enjoy your meal");
    return;
  }
  $(".cook-step").dataset.direction = step < state.step ? "back" : "forward";
  state.step = Math.max(0, step);
  renderStep();
}

$("#r-cook").addEventListener("click", () => {
  state.step = 0;
  $("#c-title").textContent = state.meal?.strMeal ?? "";
  cookDialog.showModal();
  renderStep();
  keepAwake();
});
$("#c-prev").addEventListener("click", () => go(state.step - 1));
$("#c-next").addEventListener("click", () => go(state.step + 1));
$("#c-close").addEventListener("click", () => cookDialog.close());
cookDialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") go(state.step + 1);
  if (event.key === "ArrowLeft") go(state.step - 1);
});
cookDialog.addEventListener("close", () => {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
});
document.addEventListener("visibilitychange", () => {
  // The browser drops the wake lock when the tab is hidden; ask again on return.
  if (!document.hidden && cookDialog.open) keepAwake();
});

function chime() {
  try {
    const audio = new AudioContext();
    [0, 0.25, 0.5].forEach((delay, i) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = [880, 1175, 1568][i];
      gain.gain.setValueAtTime(0.0001, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + 0.4);
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + delay);
      tone.stop(audio.currentTime + delay + 0.45);
    });
  } catch {
    // No audio: the visual alert is enough.
  }
  navigator.vibrate?.([200, 100, 200]);
}

function tickTimer() {
  const left = (timer.endsAt - Date.now()) / 1000;
  const chip = $("#c-running");
  chip.hidden = false;
  $("#c-left").textContent = clock(left);
  $("#c-ring").style.strokeDashoffset = String(100 - (Math.max(left, 0) / timer.total) * 100);
  if (left <= 0) {
    chip.classList.add("done");
    $("#c-left").textContent = "Time's up";
    announce(`Timer finished: ${timer.label}`);
    chime();
    return;
  }
  timer.frame = setTimeout(tickTimer, 250);
}

$("#c-timer").addEventListener("click", (event) => {
  const seconds = Number(event.currentTarget.dataset.seconds);
  clearTimeout(timer.frame);
  Object.assign(timer, { endsAt: Date.now() + seconds * 1000, total: seconds, label: duration(seconds) });
  $("#c-running").classList.remove("done");
  tickTimer();
  announce(`${duration(seconds)} timer started`);
});
$("#c-stop").addEventListener("click", () => {
  clearTimeout(timer.frame);
  $("#c-running").hidden = true;
});

/* ---------- views and routing ---------- */

function showView(view) {
  $("#home").hidden = view !== "home";
  $("#results").hidden = view !== "results";
  $("#saved").hidden = view !== "saved";
  if (view === "saved") {
    fillGrid($("#saved-grid"), state.saved);
    $("#saved-empty").hidden = state.saved.length > 0;
  }
}

function route() {
  const target = parseRoute(location.hash);
  if (target.view === "meal") {
    openMeal(target.id);
    return;
  }
  if (recipeDialog.open) recipeDialog.close();
  if (target.view === "saved") showView("saved");
  else {
    if ($("#search").value.trim().length < 2) showView("home");
    if (target.view === "category" && target.name !== state.category) showCategory(target.name);
  }
}

addEventListener("popstate", route);
addEventListener("hashchange", route);

document.addEventListener("click", (event) => {
  const button = event.target.closest(".card");
  if (button) goToMeal(button.dataset.id);
});

/* ---------- start ---------- */

$("#saved-count").textContent = state.saved.length ? String(state.saved.length) : "";
requestAnimationFrame(() => root.classList.add("ready"));
renderCategories();
const first = parseRoute(location.hash);
showCategory(first.view === "category" ? first.name : "Indian");
route();
surprise();
