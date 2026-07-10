/** Server-only OpenAI embedding utilities for semantic food search. */

export const FOOD_EMBEDDING_MODEL = "text-embedding-3-small";

interface EmbeddingResponse {
  data?: Array<{ index: number; embedding: number[] }>;
  error?: { message?: string };
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: FOOD_EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  if (!payload.data || payload.data.length !== texts.length) {
    throw new Error(payload.error?.message || "Embedding response was incomplete");
  }

  return payload.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}
