import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ANSWER_QUERY_PROMPT_VERSION,
  ANSWER_QUERY_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/answer-query.v1';
import { runTextQueryWithAnthropic, stripJsonFences } from '@/lib/ai/providers/anthropic';
import { answerQueryOutputSchema } from '@/lib/ai/schemas';
import type { ViewQuery } from '@/types/layout';

// =============================================================================
// answerQuery — natural-language question → ViewQuery JSON, validated.
// First real "AI reorganizes the canonical data" call site. Renders via the
// existing LayoutRenderer; no AI-generated frontend code.
// =============================================================================

export type AnswerQueryResult =
  | { ok: true; query: ViewQuery; summary: string }
  | { ok: false; error: string };

export async function answerQuery(opts: {
  supabase: SupabaseClient;
  userId: string;
  question: string;
}): Promise<AnswerQueryResult> {
  const q = opts.question.trim();
  console.log(`[ask] question=${JSON.stringify(q)}`);
  if (!q) return { ok: false, error: 'Empty question.' };

  // Pull the user's categories so the model can map names → UUIDs.
  const { data: cats } = await opts.supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', opts.userId)
    .order('name');
  console.log(`[ask] categories=${cats?.length ?? 0}`);

  const today = new Date().toISOString().slice(0, 10);
  const userText = JSON.stringify(
    {
      question: q,
      today,
      categories: cats ?? [],
    },
    null,
    2
  );

  const provider = await runTextQueryWithAnthropic({
    systemPrompt: ANSWER_QUERY_SYSTEM_PROMPT,
    promptVersion: ANSWER_QUERY_PROMPT_VERSION,
    userText,
  });
  console.log(
    `[ask] provider ok=${provider.ok} latency_ms=${provider.telemetry.latency_ms} cost=${provider.telemetry.cost_usd}`
  );

  if (!provider.ok) {
    console.log(`[ask] provider-error ${provider.error}`);
    return { ok: false, error: provider.error };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(stripJsonFences(provider.text));
  } catch (err) {
    console.log(`[ask] json-parse-fail raw=${provider.text.slice(0, 300)}`);
    return {
      ok: false,
      error: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const parsed = answerQueryOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    console.log(
      `[ask] schema-fail ${parsed.error.message} candidate=${JSON.stringify(candidate).slice(0, 300)}`
    );
    return { ok: false, error: `Schema validation failed: ${parsed.error.message}` };
  }

  console.log(
    `[ask] ok summary=${JSON.stringify(parsed.data.summary)} query=${JSON.stringify(parsed.data.query)}`
  );
  return { ok: true, query: parsed.data.query, summary: parsed.data.summary };
}
