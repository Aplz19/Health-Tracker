import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embeddings/openai';

const openaiApiKey = process.env.OPENAI_API_KEY;

interface ParsedFoodItem {
  food_name: string;
  amount: number;
  unit: string;
}

interface ParsedFoodCommand {
  foods: ParsedFoodItem[];
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export async function POST(request: NextRequest) {
  try {
    const { text, userId } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Step 1: Parse the command using GPT-4o-mini (now supports multiple foods)
    const parsed = await parseCommand(text);

    if (!parsed || parsed.foods.length === 0) {
      return NextResponse.json({
        error: 'Could not understand command',
        suggestion: 'Try something like: "6 oz chicken breast and 2 cups rice"'
      }, { status: 400 });
    }

    // Step 2: Search for each food using semantic search
    const foodResultsWithParsed = await Promise.all(
      parsed.foods.map(async (item) => {
        const matches = await searchFoodsSemanticServer(item.food_name, userId);
        return {
          parsed: item,
          matches
        };
      })
    );

    // Step 3: Return the parsed command and food matches for each item
    return NextResponse.json({
      success: true,
      parsed,
      foodResults: foodResultsWithParsed,
      message: `Found ${foodResultsWithParsed.length} food item(s)`
    });

  } catch (error) {
    console.error('AI command error:', error);
    return NextResponse.json({
      error: 'Failed to process command',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Server-side semantic search
async function searchFoodsSemanticServer(query: string, userId?: string) {
  const supabase = getServerSupabase();

  try {
    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query.toLowerCase());

    // Call the appropriate RPC function
    const rpcFunction = userId ? 'search_foods_semantic_user' : 'search_foods_semantic';

    const params: Record<string, unknown> = {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,  // Lower threshold for better recall
      match_count: 5,
    };

    if (userId) {
      params.user_id_param = userId;
    }

    const { data, error } = await supabase.rpc(rpcFunction, params);

    if (error) {
      console.error('Semantic search error:', error);
      // Fall back to text search
      return fallbackTextSearch(supabase, query);
    }

    if (!data || data.length === 0) {
      // Fall back to text search if no semantic results
      return fallbackTextSearch(supabase, query);
    }

    return data;
  } catch (error) {
    console.error('Error in searchFoodsSemanticServer:', error);
    // Fall back to text search on any error
    return fallbackTextSearch(getServerSupabase(), query);
  }
}

// Fallback text search when semantic search fails
async function fallbackTextSearch(supabase: ReturnType<typeof getServerSupabase>, query: string) {
  // First try exact match
  let { data } = await supabase
    .from('foods')
    .select('id, name, serving_size, serving_size_grams, calories, protein, total_fat, total_carbohydrates')
    .ilike('name', `%${query}%`)
    .limit(5);

  // If no results, try searching for individual words
  if (!data || data.length === 0) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    for (const word of words) {
      const { data: wordData } = await supabase
        .from('foods')
        .select('id, name, serving_size, serving_size_grams, calories, protein, total_fat, total_carbohydrates')
        .ilike('name', `%${word}%`)
        .limit(5);

      if (wordData && wordData.length > 0) {
        data = wordData;
        break;
      }
    }
  }

  return (data || []).map(food => ({
    ...food,
    similarity: 0.1,  // Low but non-zero to indicate text match
    serving_size_grams: food.serving_size_grams || 0,
  }));
}

async function parseCommand(text: string): Promise<ParsedFoodCommand | null> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a food logging assistant. Parse user commands to extract MULTIPLE food items from a single statement.

For EACH food item, extract:
- food_name: The food item (e.g., "chicken breast", "rice", "protein shake")
- amount: The quantity (number). Default to 1 if not specified.
- unit: The unit of measurement (e.g., "oz", "grams", "cup", "scoop", "serving"). Default to "serving" if not specified.

Also extract meal_type (breakfast/lunch/dinner/snack) if mentioned for the whole statement.

IMPORTANT:
- If no amount is specified for a food, use 1
- If no unit is specified, use "serving"
- Parse ALL foods mentioned, separated by "and", commas, or listed together

Examples:
"6 oz chicken breast and 2 cups rice" → foods: [{food_name: "chicken breast", amount: 6, unit: "oz"}, {food_name: "rice", amount: 2, unit: "cup"}]
"chicken breast, rice, and a protein shake for lunch" → foods: [{food_name: "chicken breast", amount: 1, unit: "serving"}, {food_name: "rice", amount: 1, unit: "serving"}, {food_name: "protein shake", amount: 1, unit: "serving"}], meal_type: "lunch"
"Premier protein" → foods: [{food_name: "Premier protein", amount: 1, unit: "serving"}]
"I had eggs and toast for breakfast" → foods: [{food_name: "eggs", amount: 1, unit: "serving"}, {food_name: "toast", amount: 1, unit: "serving"}], meal_type: "breakfast"`
        },
        {
          role: 'user',
          content: text
        }
      ],
      functions: [
        {
          name: 'log_foods',
          description: 'Log one or more food items',
          parameters: {
            type: 'object',
            properties: {
              foods: {
                type: 'array',
                description: 'Array of food items to log',
                items: {
                  type: 'object',
                  properties: {
                    food_name: {
                      type: 'string',
                      description: 'The name of the food item'
                    },
                    amount: {
                      type: 'number',
                      description: 'The quantity/amount (default 1)'
                    },
                    unit: {
                      type: 'string',
                      description: 'The unit of measurement (default "serving")'
                    }
                  },
                  required: ['food_name', 'amount', 'unit']
                }
              },
              meal_type: {
                type: 'string',
                enum: ['breakfast', 'lunch', 'dinner', 'snack'],
                description: 'The meal type, if specified'
              }
            },
            required: ['foods']
          }
        }
      ],
      function_call: { name: 'log_foods' }
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  const functionCall = data.choices[0]?.message?.function_call;

  if (!functionCall) {
    return null;
  }

  const args = JSON.parse(functionCall.arguments);

  return {
    foods: args.foods || [],
    meal_type: args.meal_type || undefined
  };
}
