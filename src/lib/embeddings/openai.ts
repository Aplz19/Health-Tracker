/**
 * OpenAI embeddings utilities for semantic search
 */

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.statusText} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Create search text from food name and serving size
 * This is what we'll generate embeddings for
 */
export function createFoodSearchText(name: string, servingSize?: string): string {
  const parts = [name];
  if (servingSize) {
    parts.push(servingSize);
  }
  return parts.join(' ').toLowerCase();
}
