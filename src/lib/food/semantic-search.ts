/**
 * Semantic food search using vector embeddings
 * NOTE: This is for client-side use. For server-side, see /api/ai/command/route.ts
 */

import { supabase } from '@/lib/supabase/client';
import { generateEmbedding } from '@/lib/embeddings/openai';

export interface SemanticSearchResult {
  id: string;
  name: string;
  serving_size: string;
  serving_size_grams: number;
  calories: number;
  protein: number;
  total_fat: number;
  total_carbohydrates: number;
  similarity: number;
  in_library?: boolean;
}

/**
 * Search foods using semantic similarity
 * @param query - Natural language search query (e.g., "chicken breast", "rice")
 * @param userId - Optional user ID to prioritize their library foods
 * @param options - Search options
 */
export async function searchFoodsSemantic(
  query: string,
  userId?: string,
  options: {
    matchThreshold?: number;  // Similarity threshold (0-1), default 0.7
    matchCount?: number;       // Max results to return, default 10
  } = {}
): Promise<SemanticSearchResult[]> {
  const { matchThreshold = 0.7, matchCount = 10 } = options;

  try {
    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query.toLowerCase());

    // Call the appropriate RPC function
    const rpcFunction = userId ? 'search_foods_semantic_user' : 'search_foods_semantic';

    const params: any = {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
    };

    if (userId) {
      params.user_id_param = userId;
    }

    const { data, error } = await supabase.rpc(rpcFunction, params);

    if (error) {
      console.error('Semantic search error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in searchFoodsSemantic:', error);
    throw error;
  }
}

/**
 * Hybrid search: combines semantic search with text search as fallback
 * Useful when user searches for something that might not have embeddings yet
 */
export async function searchFoodsHybrid(
  query: string,
  userId?: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<SemanticSearchResult[]> {
  try {
    // First try semantic search
    const semanticResults = await searchFoodsSemantic(query, userId, options);

    // If we got good results, return them
    if (semanticResults.length > 0) {
      return semanticResults;
    }

    // Fallback to traditional text search
    console.log('No semantic results, falling back to text search');
    const { data: textResults } = await supabase
      .from('foods')
      .select('id, name, serving_size, serving_size_grams, calories, protein, total_fat, total_carbohydrates')
      .ilike('name', `%${query}%`)
      .limit(options.matchCount || 10);

    // Convert to same format as semantic results (similarity = 0 for text matches)
    return (textResults || []).map(food => ({
      ...food,
      similarity: 0,
      serving_size_grams: food.serving_size_grams || 0,
    }));
  } catch (error) {
    console.error('Error in searchFoodsHybrid:', error);
    throw error;
  }
}
