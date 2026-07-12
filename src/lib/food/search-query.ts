import type { Food } from "@/lib/supabase/types";

const MAX_QUERY_LENGTH = 120;
const APOSTROPHES = /[\u0027\u02bc\u2018\u2019]/gu;

/** Normalize search text using the same canonical form expected by search SQL. */
export function normalizeFoodSearchQuery(query: string): string {
  return query
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(APOSTROPHES, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

/** Whether an input edit changes the query the server and cache will receive. */
export function isSameFoodSearchQuery(left: string, right: string): boolean {
  return normalizeFoodSearchQuery(left) === normalizeFoodSearchQuery(right);
}

function words(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

interface FoodSearchDocument {
  name: string;
  brandPhrases: string[];
  brandCompacts: string[];
  nameWords: string[];
  brandWords: string[];
  searchableWords: string[];
  orderedSequences: string[][];
  brandNamePhrases: string[];
}

function buildFoodSearchDocument(food: Food): FoodSearchDocument {
  const name = normalizeFoodSearchQuery(food.name);
  const variant = normalizeFoodSearchQuery(food.variant_label ?? "");
  const category = normalizeFoodSearchQuery(food.source_category ?? "");
  const brandPhrases = unique(
    [food.brand, food.brand_slug, ...(food.search_aliases ?? [])]
      .map((value) => normalizeFoodSearchQuery(value ?? ""))
  );
  const brandCompacts = unique(brandPhrases.map(compact));
  const nameWords = words(name);
  const brandWords = unique(brandPhrases.flatMap(words));
  const detailWords = [...nameWords, ...words(variant), ...words(category)];

  const orderedSequences = unique(brandPhrases).flatMap((brand) => {
    const normal = [...words(brand), ...detailWords];
    const compressed = [compact(brand), ...detailWords].filter(Boolean);
    return compact(brand) === brand ? [normal] : [normal, compressed];
  });
  orderedSequences.push(detailWords);

  return {
    name,
    brandPhrases,
    brandCompacts,
    nameWords,
    brandWords,
    searchableWords: unique([
      ...brandWords,
      ...brandCompacts,
      ...detailWords,
    ]),
    orderedSequences,
    brandNamePhrases: brandPhrases.flatMap((brand) =>
      unique([
        `${brand} ${name}`.trim(),
        `${compact(brand)} ${name}`.trim(),
      ])
    ),
  };
}

function startsWithPhrase(value: string, query: string): boolean {
  return value.startsWith(query);
}

function orderedWordPrefixes(queryWords: string[], candidateWords: string[]): boolean {
  let candidateIndex = 0;
  for (const queryWord of queryWords) {
    while (
      candidateIndex < candidateWords.length &&
      !candidateWords[candidateIndex].startsWith(queryWord)
    ) {
      candidateIndex += 1;
    }
    if (candidateIndex === candidateWords.length) return false;
    candidateIndex += 1;
  }
  return queryWords.length > 0;
}

function allWordPrefixes(queryWords: string[], candidateWords: string[]): boolean {
  return (
    queryWords.length > 0 &&
    queryWords.every((queryWord) =>
      candidateWords.some((candidateWord) => candidateWord.startsWith(queryWord))
    )
  );
}

/**
 * Optimal-string-alignment distance with a strict caller-provided bound.
 * It recognizes one adjacent transposition as one edit, which covers common
 * mobile typing errors without turning short fragments into fuzzy wildcards.
 */
function boundedEditDistance(left: string, right: string, maximum: number): number {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;

  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0)
  );
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = left[i - 1] === right[j - 1] ? 0 : 1;
      let distance = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        distance = Math.min(distance, matrix[i - 2][j - 2] + 1);
      }
      matrix[i][j] = distance;
    }
  }

  return matrix[left.length][right.length];
}

function isConservativeTypo(queryWord: string, candidateWord: string): boolean {
  if (queryWord.length < 4 || candidateWord.length < 4) return false;
  const comparisonWords = [candidateWord];
  if (candidateWord.length > queryWord.length + 1) {
    comparisonWords.push(
      candidateWord.slice(0, queryWord.length),
      candidateWord.slice(0, queryWord.length + 1)
    );
  }
  return comparisonWords.some(
    (comparisonWord) => boundedEditDistance(queryWord, comparisonWord, 1) === 1
  );
}

interface FoodSearchEvaluation {
  score: number;
  matched: boolean;
}

function evaluateFoodSearch(food: Food, normalizedQuery: string): FoodSearchEvaluation {
  const queryWords = words(normalizedQuery);
  if (queryWords.length === 0) return { score: 0, matched: true };

  const document = buildFoodSearchDocument(food);
  const queryCompact = compact(normalizedQuery);
  const exactName = document.name === normalizedQuery;
  const exactBrandName = document.brandNamePhrases.includes(normalizedQuery);
  const exactBrand = document.brandPhrases.includes(normalizedQuery);
  const exactCompactBrand = document.brandCompacts.includes(queryCompact);
  const namePrefix = startsWithPhrase(document.name, normalizedQuery);
  const brandPrefix = document.brandPhrases.some((brand) =>
    startsWithPhrase(brand, normalizedQuery)
  );
  const compactBrandPrefix =
    queryWords.length === 1 &&
    document.brandCompacts.some((brand) => brand.startsWith(queryCompact));
  const brandNamePrefix = document.brandNamePhrases.some((phrase) =>
    startsWithPhrase(phrase, normalizedQuery)
  );
  const orderedPrefix = document.orderedSequences.some((sequence) =>
    orderedWordPrefixes(queryWords, sequence)
  );
  const allPrefix = allWordPrefixes(queryWords, document.searchableWords);

  const unmatchedWords = queryWords.filter(
    (queryWord) =>
      !document.searchableWords.some((word) => word.startsWith(queryWord))
  );
  const minimumTypoLength = queryWords.length === 1 ? 5 : 4;
  const typoMatch =
    unmatchedWords.length === 1 &&
    unmatchedWords[0].length >= minimumTypoLength &&
    document.searchableWords.some((word) =>
      isConservativeTypo(unmatchedWords[0], word)
    );

  const matched =
    exactName ||
    exactBrandName ||
    exactBrand ||
    exactCompactBrand ||
    namePrefix ||
    brandPrefix ||
    compactBrandPrefix ||
    brandNamePrefix ||
    orderedPrefix ||
    allPrefix ||
    typoMatch;
  if (!matched) return { score: 0, matched: false };

  let score = 0;
  if (exactBrandName) score += 120_000;
  if (exactName) score += 115_000;
  if (exactBrand) score += 110_000;
  if (exactCompactBrand) score += 105_000;
  if (brandNamePrefix) score += 95_000;
  if (brandPrefix || compactBrandPrefix) score += 90_000;
  if (namePrefix) score += 85_000;
  if (orderedPrefix) score += 60_000;
  if (allPrefix) score += 45_000;
  if (typoMatch) score += 25_000;

  // Prefer matches carried by the identifying fields over category/detail
  // matches, then prefer the result needing the least completion.
  score += queryWords.filter((queryWord) =>
    document.nameWords.some((word) => word.startsWith(queryWord))
  ).length * 600;
  score += queryWords.filter((queryWord) =>
    [...document.brandWords, ...document.brandCompacts].some((word) =>
      word.startsWith(queryWord)
    )
  ).length * 700;
  score -= Math.min(500, Math.max(0, document.name.length - normalizedQuery.length));

  return { score, matched: true };
}

function compareFoods(left: Food, right: Food): number {
  const name = normalizeFoodSearchQuery(left.name).localeCompare(
    normalizeFoodSearchQuery(right.name),
    "en-US"
  );
  if (name !== 0) return name;
  const brand = normalizeFoodSearchQuery(left.brand ?? "").localeCompare(
    normalizeFoodSearchQuery(right.brand ?? ""),
    "en-US"
  );
  return brand || left.id.localeCompare(right.id, "en-US");
}

/** Deterministic ordering for a candidate set already selected by the server. */
export function rankFoodSearchResults(foods: Food[], query: string): Food[] {
  const normalized = normalizeFoodSearchQuery(query);
  if (!normalized) return [...foods];

  return foods
    .map((food) => ({ food, evaluation: evaluateFoodSearch(food, normalized) }))
    .sort(
      (left, right) =>
        right.evaluation.score - left.evaluation.score ||
        compareFoods(left.food, right.food)
    )
    .map(({ food }) => food);
}

/** Match and rank a complete local collection, such as the personal library. */
export function matchAndRankFoodSearchResults(foods: Food[], query: string): Food[] {
  const normalized = normalizeFoodSearchQuery(query);
  if (!normalized) return [...foods];

  return foods
    .map((food) => ({ food, evaluation: evaluateFoodSearch(food, normalized) }))
    .filter(({ evaluation }) => evaluation.matched)
    .sort(
      (left, right) =>
        right.evaluation.score - left.evaluation.score ||
        compareFoods(left.food, right.food)
    )
    .map(({ food }) => food);
}
