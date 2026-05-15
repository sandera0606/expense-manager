import 'server-only';

import { query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import {
  EXTRACT_RECEIPT_PROMPT_VERSION,
  EXTRACT_RECEIPT_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/extract-receipt.v3';
import {
  extractedReceiptSchema,
  extractedReceiptToolSchema,
} from '@/lib/ai/schemas';
import type { ExtractedReceipt, ExtractionTelemetry } from '@/types/ai';

// -----------------------------------------------------------------------------
// Provider strategy
// -----------------------------------------------------------------------------
// Local dev:  no ANTHROPIC_API_KEY → use Claude Agent SDK, which authenticates
//             via the user's logged-in `claude` CLI (Claude Code OAuth). The
//             SDK spawns the CLI as a subprocess. Requires `claude login` to
//             have been run on this machine.
// Production: ANTHROPIC_API_KEY set → not yet implemented. When deploying to
//             Vercel, add a sibling `extractViaApi` that calls
//             `@anthropic-ai/sdk` `messages.create()` directly with tools.
//             The Agent SDK path will NOT work on serverless (no CLI binary).
// -----------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export type ProviderExtractionResult =
  | {
      ok: true;
      data: ExtractedReceipt;
      raw: unknown;
      telemetry: ExtractionTelemetry;
    }
  | {
      ok: false;
      error: string;
      raw: unknown;
      telemetry: ExtractionTelemetry;
    };

export async function extractReceiptWithAnthropic(input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<ProviderExtractionResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    // TODO(prod): swap to direct @anthropic-ai/sdk messages.create() here.
    // The Agent SDK path below works in local dev only.
  }

  const startedAt = Date.now();
  const base64 = Buffer.from(input.bytes).toString('base64');

  const fileBlock = buildFileContentBlock(input.mimeType, base64);
  if (!fileBlock) {
    return {
      ok: false,
      error: `Unsupported MIME type for extraction: ${input.mimeType}`,
      raw: null,
      telemetry: telemetryFrom(null, 0),
    };
  }

  const userMessage: SDKUserMessage = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        fileBlock,
        {
          type: 'text',
          text: `Extract this receipt. Return ONLY a single JSON object (no prose, no markdown fences) with exactly these keys:

{
  "occurred_at": "ISO-8601 date or datetime",
  "merchant": "string or null",
  "total_amount": number,
  "currency": "ISO 4217 code, default USD",
  "payment_method": "string or null",
  "line_items": [{"description":"string","quantity":number|null,"unit_price":number|null,"total":number,"category_hint":"same enum as top-level, or null to inherit transaction category"}],
  "category_hint": "Food & Drink|Groceries|Transport|Housing|Utilities|Health|Entertainment|Shopping|Travel|Subscriptions|Income|Other|null",
  "notes": "string or null",
  "confidence": number between 0 and 1
}`,
        },
      ],
    },
    parent_tool_use_id: null,
  };

  async function* prompt(): AsyncIterable<SDKUserMessage> {
    yield userMessage;
  }

  let result: Extract<SDKMessage, { type: 'result' }> | null = null;
  try {
    const q = query({
      prompt: prompt(),
      options: {
        systemPrompt: EXTRACT_RECEIPT_SYSTEM_PROMPT,
        model: DEFAULT_MODEL,
        // 2 turns: room for Claude Code's internal model router (a Haiku
        // sidecar runs alongside Sonnet) without losing the Sonnet response.
        maxTurns: 2,
        tools: [],
        // Note: we used to pass outputFormat: { type: 'json_schema', schema }.
        // That triggers an internal tool_use path which needs additional turns
        // to fold the tool result back into result.result. The Agent SDK does
        // not reliably populate structured_output from it in v0.2.x, so we
        // skip it and parse Claude's plain text JSON output instead. The
        // system prompt already instructs the model to return JSON only.
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        persistSession: false,
      },
    });

    for await (const msg of q) {
      if (msg.type === 'result') {
        result = msg as Extract<SDKMessage, { type: 'result' }>;
        break;
      }
    }
  } catch (err) {
    const latency_ms = Date.now() - startedAt;
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      raw: null,
      telemetry: telemetryFrom(null, latency_ms),
    };
  }

  const latency_ms = Date.now() - startedAt;

  if (!result) {
    return {
      ok: false,
      error: 'Agent SDK returned no result message.',
      raw: null,
      telemetry: telemetryFrom(null, latency_ms),
    };
  }

  if (result.subtype !== 'success') {
    return {
      ok: false,
      error:
        ('errors' in result && Array.isArray(result.errors) && result.errors.length > 0
          ? result.errors.join('; ')
          : null) ?? `Extraction failed: ${result.subtype}`,
      raw: result,
      telemetry: telemetryFrom(result, latency_ms),
    };
  }

  // Prefer structured_output if the SDK populated it; otherwise parse the
  // model's final text response. Agent SDK v0.2.x doesn't reliably populate
  // structured_output from outputFormat, so the text-parse path is the
  // primary one for now.
  let candidate: unknown = undefined;
  if ('structured_output' in result && result.structured_output !== undefined) {
    candidate = result.structured_output;
  } else if (typeof result.result === 'string' && result.result.length > 0) {
    try {
      candidate = JSON.parse(stripJsonFences(result.result));
    } catch (err) {
      return {
        ok: false,
        error: `Failed to parse JSON from model response: ${
          err instanceof Error ? err.message : String(err)
        }`,
        raw: result.result,
        telemetry: telemetryFrom(result, latency_ms),
      };
    }
  } else {
    return {
      ok: false,
      error: 'Result has neither structured_output nor result text.',
      raw: result,
      telemetry: telemetryFrom(result, latency_ms),
    };
  }

  const parsed = extractedReceiptSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Schema validation failed: ${parsed.error.message}`,
      raw: candidate,
      telemetry: telemetryFrom(result, latency_ms),
    };
  }

  return {
    ok: true,
    data: parsed.data,
    raw: candidate,
    telemetry: telemetryFrom(result, latency_ms),
  };
}

// -----------------------------------------------------------------------------
// Generic one-shot text query — same Agent SDK plumbing as the receipt
// extractor, but with a text-only user message. Used by the NL→ViewQuery
// flow and any future "ask Claude for JSON" call sites.
// -----------------------------------------------------------------------------

export type TextQueryResult =
  | {
      ok: true;
      text: string;
      raw: unknown;
      telemetry: Omit<ExtractionTelemetry, 'prompt_version'> & { prompt_version: string };
    }
  | {
      ok: false;
      error: string;
      raw: unknown;
      telemetry: Omit<ExtractionTelemetry, 'prompt_version'> & { prompt_version: string };
    };

export async function runTextQueryWithAnthropic(input: {
  systemPrompt: string;
  promptVersion: string;
  userText: string;
}): Promise<TextQueryResult> {
  const startedAt = Date.now();
  const userMessage: SDKUserMessage = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: input.userText }],
    },
    parent_tool_use_id: null,
  };

  async function* prompt(): AsyncIterable<SDKUserMessage> {
    yield userMessage;
  }

  let result: Extract<SDKMessage, { type: 'result' }> | null = null;
  try {
    const q = query({
      prompt: prompt(),
      options: {
        systemPrompt: input.systemPrompt,
        model: DEFAULT_MODEL,
        maxTurns: 2,
        tools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        persistSession: false,
      },
    });

    for await (const msg of q) {
      if (msg.type === 'result') {
        result = msg as Extract<SDKMessage, { type: 'result' }>;
        break;
      }
    }
  } catch (err) {
    const latency_ms = Date.now() - startedAt;
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      raw: null,
      telemetry: { ...telemetryFrom(null, latency_ms), prompt_version: input.promptVersion },
    };
  }

  const latency_ms = Date.now() - startedAt;

  if (!result) {
    return {
      ok: false,
      error: 'Agent SDK returned no result message.',
      raw: null,
      telemetry: { ...telemetryFrom(null, latency_ms), prompt_version: input.promptVersion },
    };
  }

  if (result.subtype !== 'success') {
    return {
      ok: false,
      error:
        ('errors' in result && Array.isArray(result.errors) && result.errors.length > 0
          ? result.errors.join('; ')
          : null) ?? `Query failed: ${result.subtype}`,
      raw: result,
      telemetry: { ...telemetryFrom(result, latency_ms), prompt_version: input.promptVersion },
    };
  }

  if (typeof result.result !== 'string' || result.result.length === 0) {
    return {
      ok: false,
      error: 'Result has no result text.',
      raw: result,
      telemetry: { ...telemetryFrom(result, latency_ms), prompt_version: input.promptVersion },
    };
  }

  return {
    ok: true,
    text: result.result,
    raw: result,
    telemetry: { ...telemetryFrom(result, latency_ms), prompt_version: input.promptVersion },
  };
}

export { stripJsonFences };

// Dispatch on MIME type: images go through an `image` content block, PDFs
// through a `document` block. Sonnet 4.6 accepts both natively.
type ImageBlock = {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    data: string;
  };
};

type DocumentBlock = {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
};

function buildFileContentBlock(
  mimeType: string,
  base64: string
): ImageBlock | DocumentBlock | null {
  if (mimeType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    };
  }
  if (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp' ||
    mimeType === 'image/gif'
  ) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: base64 },
    };
  }
  return null;
}

// Strip ```json ... ``` or ``` ... ``` fences, or fall back to the first
// `{` … last `}` slice. Models sometimes wrap JSON in markdown despite being
// told not to.
function stripJsonFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function telemetryFrom(
  result: Extract<SDKMessage, { type: 'result' }> | null,
  latency_ms: number
): ExtractionTelemetry {
  if (!result || !('usage' in result)) {
    return {
      provider: 'anthropic',
      model: DEFAULT_MODEL,
      prompt_version: EXTRACT_RECEIPT_PROMPT_VERSION,
      input_tokens: null,
      output_tokens: null,
      latency_ms,
      cost_usd: null,
    };
  }
  const usage = result.usage as { input_tokens?: number; output_tokens?: number };
  return {
    provider: 'anthropic',
    model: DEFAULT_MODEL,
    prompt_version: EXTRACT_RECEIPT_PROMPT_VERSION,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    latency_ms,
    cost_usd: 'total_cost_usd' in result ? (result.total_cost_usd as number) : null,
  };
}
