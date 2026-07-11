import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding, FOOD_EMBEDDING_MODEL } from "@/lib/embeddings/openai";
import { normalizeFood } from "@/lib/food/client-food";
import { normalizeFoodSearchQuery, rankFoodSearchResults } from "@/lib/food/search-query";
import type { Food } from "@/lib/supabase/types";

export type FoodSearchMode = "hybrid" | "lexical" | "legacy";

export interface FoodSearchResponse {
  foods: Food[];
  mode: FoodSearchMode;
}

interface SearchOptions {
  limit?: number;
  useSemantic?: boolean;
}

interface EmbeddingCacheEntry {
  embedding: number[];
  expiresAt: number;
}

const QUERY_EMBEDDING_TTL_MS = 15 * 60 * 1_000;
const MAX_QUERY_EMBEDDINGS = 100;
const embeddingCache = new Map<string, EmbeddingCacheEntry>();
let hybridRpcAvailable: boolean | null = null;

export function buildLegacyFoodSearchFilters(
  query: string,
  includeBrand = true
): string[] {
  return query
    .split(" ")
    .filter(Boolean)
    .slice(0, 8)
    .map((term) =>
      [
        `name.ilike.%${term}%`,
        ...(includeBrand
          ? [`brand.ilike.%${term}%`, `brand_slug.ilike.%${term}%`]
          : []),
      ].join(",")
    );
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "PGRST202" ||
        error.message?.toLowerCase().includes("could not find the function"))
  );
}

async function getQueryEmbedding(query: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const cached = embeddingCache.get(query);
  if (cached && cached.expiresAt > Date.now()) {
    embeddingCache.delete(query);
    embeddingCache.set(query, cached);
    return cached.embedding;
  }

  try {
    const embedding = await generateEmbedding(query);
    embeddingCache.set(query, {
      embedding,
      expiresAt: Date.now() + QUERY_EMBEDDING_TTL_MS,
    });
    while (embeddingCache.size > MAX_QUERY_EMBEDDINGS) {
      const oldest = embeddingCache.keys().next().value as string | undefined;
      if (!oldest) break;
      embeddingCache.delete(oldest);
    }
    return embedding;
  } catch (error) {
    console.warn("Semantic query embedding unavailable; using lexical search", error);
    return null;
  }
}

function normalizeRows(rows: unknown[] | null): Food[] {
  return (rows || [])
    .filter((row): row is Parameters<typeof normalizeFood>[0] => {
      if (!row || typeof row !== "object") return false;
      const candidate = row as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.serving_size === "string"
      );
    })
    .map(normalizeFood);
}

async function legacySearch(
  supabase: SupabaseClient,
  query: string,
  limit: number
): Promise<Food[]> {
  const execute = (includeBrand: boolean) => {
    let request = supabase.from("foods").select("*");
    for (const filter of buildLegacyFoodSearchFilters(query, includeBrand)) {
      // Each OR group handles one token; chaining groups keeps multi-token
      // searches conjunctive while allowing the token in name or brand fields.
      request = request.or(filter);
    }
    return request.limit(Math.min(limit * 3, 100));
  };

  let { data, error } = await execute(true);
  const message = error?.message?.toLowerCase() ?? "";
  if (
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("schema cache"))
  ) {
    ({ data, error } = await execute(false));
  }
  if (error) throw error;
  return rankFoodSearchResults(normalizeRows(data as unknown[]), query).slice(0, limit);
}

/**
 * Upgrade-aware global search. It uses the new hybrid RPC when installed,
 * the current lexical RPC during rollout, and the legacy table as a final
 * compatibility path. The browser never receives an embedding column.
 */
export async function searchFoodsServer(
  supabase: SupabaseClient,
  rawQuery: string,
  options: SearchOptions = {}
): Promise<FoodSearchResponse> {
  const query = normalizeFoodSearchQuery(rawQuery);
  if (query.length < 2) return { foods: [], mode: "legacy" };

  const limit = Math.max(1, Math.min(options.limit ?? 50, 50));
  if (hybridRpcAvailable !== false) {
    // Probe a not-yet-known deployment without spending an embedding token.
    // Once the RPC is confirmed, this process remembers the capability.
    if (hybridRpcAvailable === null) {
      const probe = await supabase.rpc("search_foods_hybrid", {
        search_query: query,
        query_embedding: null,
        embedding_model_param: null,
        result_limit: limit,
      });
      if (!probe.error) {
        hybridRpcAvailable = true;
        if (options.useSemantic === false || !process.env.OPENAI_API_KEY) {
          return {
            foods: normalizeRows(probe.data as unknown[]),
            mode: "hybrid",
          };
        }
      } else if (isMissingFunction(probe.error)) {
        hybridRpcAvailable = false;
      } else {
        console.warn("Hybrid food search probe failed; trying compatibility search", probe.error);
      }
    }

    if (hybridRpcAvailable) {
      const embedding = options.useSemantic === false ? null : await getQueryEmbedding(query);
      const { data: hybridData, error: hybridError } = await supabase.rpc(
        "search_foods_hybrid",
        {
          search_query: query,
          query_embedding: embedding,
          embedding_model_param: embedding ? FOOD_EMBEDDING_MODEL : null,
          result_limit: limit,
        }
      );
      if (!hybridError) {
        return {
          // The SQL RPC has already fused lexical and semantic ranks. Preserve
          // that order so a client-side lexical sort cannot erase semantics.
          foods: normalizeRows(hybridData as unknown[]),
          mode: "hybrid",
        };
      }
      if (isMissingFunction(hybridError)) hybridRpcAvailable = false;
      else console.warn("Hybrid food search failed; trying compatibility search", hybridError);
    }
  }

  const { data: lexicalData, error: lexicalError } = await supabase.rpc(
    "search_global_foods",
    { search_query: query, result_limit: limit }
  );
  if (!lexicalError) {
    return {
      foods: rankFoodSearchResults(normalizeRows(lexicalData as unknown[]), query),
      mode: "lexical",
    };
  }
  if (!isMissingFunction(lexicalError)) {
    console.warn("Lexical food search RPC failed; using legacy search", lexicalError);
  }

  return { foods: await legacySearch(supabase, query, limit), mode: "legacy" };
}
