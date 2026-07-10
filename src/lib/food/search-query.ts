import type { Food } from "@/lib/supabase/types";

const MAX_QUERY_LENGTH = 120;

/** Normalize user text without discarding non-English letters and numbers. */
export function normalizeFoodSearchQuery(query: string): string {
  return query
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

function searchableFoodText(food: Food): string {
  return normalizeFoodSearchQuery(
    [
      food.brand,
      food.brand_slug,
      food.name,
      food.variant_label,
      food.source_category,
      ...(food.search_aliases || []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/** Deterministic final ordering for legacy results and exact-match boosting. */
export function rankFoodSearchResults(foods: Food[], query: string): Food[] {
  const normalized = normalizeFoodSearchQuery(query);
  const terms = normalized.split(" ").filter(Boolean);

  const score = (food: Food): number => {
    const name = normalizeFoodSearchQuery(food.name);
    const brand = normalizeFoodSearchQuery(food.brand ?? "");
    const document = searchableFoodText(food);
    const compactDocument = document.replace(/\s+/g, "");
    let value = 0;

    if (name === normalized) value += 1_000;
    if (`${brand} ${name}`.trim() === normalized) value += 950;
    if (name.startsWith(normalized)) value += 500;
    if (document.startsWith(normalized)) value += 400;
    if (document.includes(normalized)) value += 250;
    value += terms.filter(
      (term) => document.includes(term) || compactDocument.includes(term)
    ).length * 40;
    if (
      terms.length > 0 &&
      terms.every((term) => document.includes(term) || compactDocument.includes(term))
    ) value += 200;
    if (food.source === "restaurant_official") value += 5;
    return value;
  };

  return [...foods].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}
