# Vector Search Setup Guide

This guide explains how to enable semantic food search using OpenAI embeddings and Supabase pgvector.

## What is Vector Search?

Traditional search matches exact text:
- Search "chicken" → only finds foods with "chicken" in the name

Semantic search understands meaning:
- Search "chicken" → finds "Just Bare Chicken Tenderloin", "Grilled Poultry", "Chicken Breast", etc.
- Search "protein shake" → finds "Whey Protein Isolate", "Muscle Milk", etc.

## Prerequisites

1. **Supabase project** with pgvector extension enabled
2. **OpenAI API key** (for generating embeddings)
3. **Service role key** from Supabase (for the migration script)

## Setup Steps

### 1. Enable pgvector in Supabase

**Option A: Via Dashboard**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Database** → **Extensions**
4. Find `vector` and click **Enable**

**Option B: Via SQL Editor**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Run the Migration SQL

In Supabase SQL Editor, run the entire contents of:
```
sql/add_vector_search.sql
```

This will:
- Add `embedding` column to `foods` table
- Create vector index for fast search
- Create search functions (`search_foods_semantic`, `search_foods_semantic_user`)

### 3. Add Environment Variables

Create or update `.env.local`:

```env
# OpenAI API Key (get from platform.openai.com)
OPENAI_API_KEY=sk-...

# Supabase Service Role Key (get from Supabase Dashboard → Settings → API)
# ⚠️ NEVER commit this to git - keep it in .env.local only!
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Install TypeScript Execution Tool

```bash
npm install -D tsx dotenv
```

### 5. Generate Embeddings for Existing Foods

Run the migration script:

```bash
npx tsx scripts/generate-food-embeddings.ts
```

This will:
- Fetch all foods without embeddings
- Generate embeddings using OpenAI API
- Update the database
- Show progress and results

**Cost:** ~$0.0001 per 1000 foods (very cheap)

**Time:** ~1-2 minutes for 1000 foods

### 6. Test It

Try a semantic search in your app or via SQL:

```sql
-- Generate an embedding for "chicken" first (you'd do this in code)
-- Then query:
SELECT * FROM search_foods_semantic(
  query_embedding := (SELECT embedding FROM foods WHERE name ILIKE '%chicken%' LIMIT 1),
  match_threshold := 0.7,
  match_count := 5
);
```

## How It Works

### When adding new foods:

```typescript
import { generateEmbedding, createFoodSearchText } from '@/lib/embeddings/openai';

const food = {
  name: "Chicken Breast",
  serving_size: "4 oz"
};

const searchText = createFoodSearchText(food.name, food.serving_size);
const embedding = await generateEmbedding(searchText);

await supabase.from('foods').insert({
  ...food,
  embedding
});
```

### When searching:

```typescript
import { searchFoodsSemantic } from '@/lib/food/semantic-search';

const results = await searchFoodsSemantic('chicken', userId, {
  matchThreshold: 0.7,  // How similar (0-1)
  matchCount: 10        // Max results
});
```

## Performance

- **Search speed:** ~50-100ms (including embedding generation)
- **Accuracy:** Much better than text search for natural language
- **Cost:** $0.0001 per search (embedding generation)

## Hybrid Search

For best results, use hybrid search (semantic + text fallback):

```typescript
import { searchFoodsHybrid } from '@/lib/food/semantic-search';

// Tries semantic first, falls back to text search if no results
const results = await searchFoodsHybrid('chicken', userId);
```

## Troubleshooting

### "extension vector is not available"
- Enable pgvector in Supabase extensions

### "OPENAI_API_KEY is not set"
- Add it to `.env.local`

### "SUPABASE_SERVICE_ROLE_KEY is not set"
- Get it from Supabase Dashboard → Settings → API
- Add to `.env.local` (never commit this!)

### No results from semantic search
- Check that foods have embeddings (run migration script)
- Lower `matchThreshold` (try 0.5 instead of 0.7)
- Use hybrid search as fallback

## Next Steps

Once vector search is working, you can:
1. Add AI voice commands that use semantic search
2. Implement "smart suggestions" based on search history
3. Add semantic search for exercises too
