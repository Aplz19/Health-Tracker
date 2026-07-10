import { NextRequest, NextResponse } from "next/server";
import { searchFoodsServer } from "@/lib/food/server-search";
import { getRequestSupabase } from "@/lib/supabase/request";

const openaiApiKey = process.env.OPENAI_API_KEY;
const COMMAND_MODEL = process.env.OPENAI_COMMAND_MODEL || "gpt-4o-mini";
const MAX_COMMAND_LENGTH = 500;
const MAX_FOODS_PER_COMMAND = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_COMMANDS_PER_WINDOW = 20;
const rateWindows = new Map<string, { startedAt: number; count: number }>();

interface ParsedFoodItem {
  food_name: string;
  amount: number;
  unit: string;
}

interface ParsedFoodCommand {
  foods: ParsedFoodItem[];
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack";
}

interface OpenAICommandResponse {
  choices?: Array<{
    message?: { function_call?: { arguments?: string } };
  }>;
}

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const current = rateWindows.get(userId);
  if (!current || current.startedAt + RATE_WINDOW_MS <= now) {
    rateWindows.set(userId, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_COMMANDS_PER_WINDOW;
}

function validateParsedCommand(value: unknown): ParsedFoodCommand | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.foods)) return null;

  const foods = candidate.foods
    .slice(0, MAX_FOODS_PER_COMMAND)
    .filter((food): food is Record<string, unknown> => Boolean(food && typeof food === "object"))
    .map((food) => ({
      food_name: typeof food.food_name === "string" ? food.food_name.trim().slice(0, 120) : "",
      amount: typeof food.amount === "number" && Number.isFinite(food.amount) && food.amount > 0
        ? food.amount
        : 1,
      unit: typeof food.unit === "string" ? food.unit.trim().slice(0, 30) || "serving" : "serving",
    }))
    .filter((food) => food.food_name.length > 0);

  const mealTypes = new Set(["breakfast", "lunch", "dinner", "snack"]);
  const mealType = typeof candidate.meal_type === "string" && mealTypes.has(candidate.meal_type)
    ? (candidate.meal_type as ParsedFoodCommand["meal_type"])
    : undefined;

  return foods.length > 0 ? { foods, meal_type: mealType } : null;
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isRateLimited(user.id)) {
    return NextResponse.json({ error: "Too many AI commands; try again shortly" }, { status: 429 });
  }
  if (!openaiApiKey) {
    return NextResponse.json({ error: "AI food logging is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = body && typeof body === "object" && typeof (body as Record<string, unknown>).text === "string"
    ? (body as Record<string, string>).text.trim()
    : "";
  if (!text || text.length > MAX_COMMAND_LENGTH) {
    return NextResponse.json(
      { error: `Text is required and must be at most ${MAX_COMMAND_LENGTH} characters` },
      { status: 400 }
    );
  }

  try {
    const parsed = await parseCommand(text);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "Could not understand command",
          suggestion: 'Try something like: "6 oz chicken breast and 2 cups rice"',
        },
        { status: 400 }
      );
    }

    const foodResults = await Promise.all(
      parsed.foods.map(async (item) => {
        const result = await searchFoodsServer(supabase, item.food_name, { limit: 5 });
        return { parsed: item, matches: result.foods };
      })
    );

    return NextResponse.json({ success: true, parsed, foodResults });
  } catch (error) {
    console.error("AI food command failed", error);
    return NextResponse.json({ error: "Failed to process food command" }, { status: 502 });
  }
}

async function parseCommand(text: string): Promise<ParsedFoodCommand | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: COMMAND_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Parse every food in the request. Use amount 1 and unit serving when omitted. " +
            "Only set meal_type when breakfast, lunch, dinner, or snack is explicit.",
        },
        { role: "user", content: text },
      ],
      functions: [
        {
          name: "log_foods",
          description: "Parse one or more foods for logging",
          parameters: {
            type: "object",
            properties: {
              foods: {
                type: "array",
                maxItems: MAX_FOODS_PER_COMMAND,
                items: {
                  type: "object",
                  properties: {
                    food_name: { type: "string" },
                    amount: { type: "number" },
                    unit: { type: "string" },
                  },
                  required: ["food_name", "amount", "unit"],
                },
              },
              meal_type: {
                type: "string",
                enum: ["breakfast", "lunch", "dinner", "snack"],
              },
            },
            required: ["foods"],
          },
        },
      ],
      function_call: { name: "log_foods" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Food parser request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as OpenAICommandResponse;
  const argumentsJson = payload.choices?.[0]?.message?.function_call?.arguments;
  if (!argumentsJson) return null;

  try {
    return validateParsedCommand(JSON.parse(argumentsJson) as unknown);
  } catch {
    return null;
  }
}
