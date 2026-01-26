/**
 * One-time migration script to generate embeddings for existing foods
 *
 * Prerequisites:
 * 1. Run sql/add_vector_search.sql in Supabase SQL editor
 * 2. Set OPENAI_API_KEY in .env.local
 * 3. Run: npx tsx scripts/generate-food-embeddings.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Need service key for admin access
const openaiApiKey = process.env.OPENAI_API_KEY!;

if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
  console.error('Missing required environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  console.error('- OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Food {
  id: string;
  name: string;
  serving_size: string;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function createFoodSearchText(food: Food): string {
  // Combine name and serving size for better semantic matching
  return `${food.name} ${food.serving_size}`.toLowerCase();
}

async function main() {
  console.log('Starting food embedding generation...\n');

  // Fetch all foods without embeddings
  const { data: foods, error: fetchError } = await supabase
    .from('foods')
    .select('id, name, serving_size')
    .is('embedding', null);

  if (fetchError) {
    console.error('Error fetching foods:', fetchError);
    process.exit(1);
  }

  if (!foods || foods.length === 0) {
    console.log('No foods found without embeddings. Migration complete!');
    return;
  }

  console.log(`Found ${foods.length} foods without embeddings\n`);

  let processed = 0;
  let failed = 0;
  const batchSize = 10;

  for (let i = 0; i < foods.length; i += batchSize) {
    const batch = foods.slice(i, i + batchSize);

    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${i + 1}-${Math.min(i + batchSize, foods.length)} of ${foods.length})...`);

    await Promise.all(
      batch.map(async (food) => {
        try {
          const searchText = createFoodSearchText(food);
          const embedding = await generateEmbedding(searchText);

          const { error: updateError } = await supabase
            .from('foods')
            .update({ embedding })
            .eq('id', food.id);

          if (updateError) {
            console.error(`  ✗ Failed to update ${food.name}:`, updateError.message);
            failed++;
          } else {
            console.log(`  ✓ ${food.name}`);
            processed++;
          }
        } catch (error) {
          console.error(`  ✗ Error processing ${food.name}:`, error);
          failed++;
        }
      })
    );

    // Rate limiting: OpenAI has rate limits, so add a small delay between batches
    if (i + batchSize < foods.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Migration complete!');
  console.log(`✓ Successfully processed: ${processed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
