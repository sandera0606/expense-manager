import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ExtractedReceipt } from '@/types/ai';

// =============================================================================
// Map an ExtractedReceipt → canonical `transactions` (+ line_items) rows.
// This is the ONLY place that writes canonical rows from AI output.
//
// - merchant_normalized: lowercase + strip trailing store numbers like "#4421".
// - category resolution: match existing by name (case-insensitive), or auto-
//   create when confidence ≥ threshold. Lines can have their own category;
//   null means "inherit transaction's category" at read time.
// - confidence < REVIEW_THRESHOLD ⇒ receipt status becomes 'needs_review'
//   and the transaction is still inserted (the user can edit / confirm).
// =============================================================================

export const REVIEW_CONFIDENCE_THRESHOLD = 0.6;
// Below this the extractor is signalling "not a receipt" (per v3 prompt). We
// drop the record rather than pollute the canonical transactions table with
// merchant=null, total=0 rows that would still appear in the feed.
export const REJECT_CONFIDENCE_THRESHOLD = 0.3;

export type NormalizeResult =
  | { ok: true; transactionId: string; needsReview: boolean }
  | { ok: false; error: string; rejected?: boolean };

export async function normalizeReceipt(opts: {
  supabase: SupabaseClient;
  userId: string;
  receiptId: string;
  extracted: ExtractedReceipt;
}): Promise<NormalizeResult> {
  const { supabase, userId, receiptId, extracted } = opts;

  if (extracted.confidence < REJECT_CONFIDENCE_THRESHOLD) {
    const reason = extracted.notes ?? 'Not recognized as a receipt';
    console.log(
      `[normalize] reject receipt=${receiptId} confidence=${extracted.confidence} reason=${JSON.stringify(reason)}`
    );
    return { ok: false, error: `Rejected: ${reason}`, rejected: true };
  }

  const merchantNormalized = normalizeMerchant(extracted.merchant);
  const dateParse = normalizeDate(extracted.occurred_at);
  const occurredAt = dateParse.value;
  if (dateParse.fallback) {
    console.log(
      `[normalize] date-fallback receipt=${receiptId} raw=${JSON.stringify(extracted.occurred_at)} → ${occurredAt} (forcing needs_review)`
    );
  }
  console.log(
    `[normalize] receipt=${receiptId} merchant=${merchantNormalized} occurred_at=${occurredAt} hint=${extracted.category_hint ?? '∅'} lines=${extracted.line_items.length}`
  );

  let categoryId: string | null = null;
  if (extracted.category_hint) {
    categoryId = await resolveCategory({
      supabase,
      userId,
      hint: extracted.category_hint,
      confidence: extracted.confidence,
    });
    console.log(
      `[normalize] txn-category hint=${extracted.category_hint} → ${categoryId ?? 'null (low-confidence, no autocreate)'}`
    );
  }

  const { data: txn, error: txnErr } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      receipt_id: receiptId,
      occurred_at: occurredAt,
      merchant: extracted.merchant,
      merchant_normalized: merchantNormalized,
      total_amount: extracted.total_amount,
      currency: extracted.currency,
      payment_method: extracted.payment_method ?? null,
      category_id: categoryId,
      notes: extracted.notes ?? null,
      confidence: extracted.confidence,
    })
    .select('id')
    .single();

  if (txnErr || !txn) {
    console.log(`[normalize] txn-insert-fail ${txnErr?.message ?? 'unknown'}`);
    return { ok: false, error: txnErr?.message ?? 'Failed to insert transaction' };
  }
  console.log(`[normalize] txn-insert id=${txn.id}`);

  if (extracted.line_items.length > 0) {
    // Resolve per-line category hints in parallel. A null hint means the line
    // inherits the transaction's category at read time, so we don't write
    // category_id for those.
    const lineCategoryIds = await Promise.all(
      extracted.line_items.map((item) =>
        item.category_hint
          ? resolveCategory({
              supabase,
              userId,
              hint: item.category_hint,
              confidence: extracted.confidence,
            })
          : Promise.resolve(null)
      )
    );

    const rows = extracted.line_items.map((item, idx) => ({
      transaction_id: txn.id,
      description: item.description,
      quantity: item.quantity ?? null,
      unit_price: item.unit_price ?? null,
      total: item.total,
      position: idx,
      category_id: lineCategoryIds[idx],
    }));
    const { error: lineErr } = await supabase
      .from('transaction_line_items')
      .insert(rows);
    if (lineErr) {
      // The transaction is the canonical record; line items are
      // supplementary. Don't roll back the whole receipt — keep the txn,
      // force needs_review, and let the user re-extract or accept it as-is.
      console.log(`[normalize] lines-insert-fail keeping-txn ${lineErr.message}`);
      return { ok: true, transactionId: txn.id, needsReview: true };
    }
    const lineCategorized = lineCategoryIds.filter((c) => c !== null).length;
    console.log(
      `[normalize] lines-inserted count=${rows.length} categorized=${lineCategorized}`
    );
  }

  const needsReview =
    extracted.confidence < REVIEW_CONFIDENCE_THRESHOLD || dateParse.fallback;
  console.log(`[normalize] done txn=${txn.id} needs_review=${needsReview}`);
  return { ok: true, transactionId: txn.id, needsReview };
}

// -----------------------------------------------------------------------------
// Resolve a category by name (case-insensitive). If no match exists and the
// extraction is reasonably confident, create a new category so the user's
// taxonomy organically expands with novel hints from the model.
// -----------------------------------------------------------------------------
const CATEGORY_AUTOCREATE_CONFIDENCE = 0.7;

async function resolveCategory(opts: {
  supabase: SupabaseClient;
  userId: string;
  hint: string;
  confidence: number;
}): Promise<string | null> {
  const trimmed = opts.hint.trim();
  if (!trimmed) return null;

  const { data: existing } = await opts.supabase
    .from('categories')
    .select('id')
    .eq('user_id', opts.userId)
    .ilike('name', trimmed)
    .maybeSingle();
  if (existing?.id) return existing.id;

  if (opts.confidence < CATEGORY_AUTOCREATE_CONFIDENCE) return null;

  // upsert handles the rare race where two concurrent extractions invent the
  // same category name; the unique (user_id, name) constraint funnels both to
  // a single row.
  const { data: created } = await opts.supabase
    .from('categories')
    .upsert({ user_id: opts.userId, name: trimmed }, { onConflict: 'user_id,name' })
    .select('id')
    .single();
  return created?.id ?? null;
}

// -----------------------------------------------------------------------------
// "STARBUCKS #4421" → "starbucks". Conservative: only strips trailing
// "#NNN" tokens. Leaves the rest alone so we don't accidentally collapse
// distinct merchants.
// -----------------------------------------------------------------------------
export function normalizeMerchant(merchant: string | null): string | null {
  if (!merchant) return null;
  return merchant
    .toLowerCase()
    .replace(/\s*#\s*\d+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

// Accepts "2025-03-14", "2025-03-14T13:45:00Z", "03/14/2025", etc.
// Defaults to midnight UTC when only a date is provided.
//
// Returns { fallback: true } when the input was unparseable and we had to
// invent a date. The caller forces needs_review in that case so today's
// timestamp doesn't silently masquerade as the receipt's real date.
type DateParse = { value: string; fallback: boolean };

function normalizeDate(input: string): DateParse {
  const date = new Date(input);
  if (!Number.isNaN(date.getTime())) {
    return { value: date.toISOString(), fallback: false };
  }
  // Fallback: parse YYYY-MM-DD or MM/DD/YYYY manually.
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return {
      value: `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`,
      fallback: false,
    };
  }
  const us = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const m = us[1].padStart(2, '0');
    const d = us[2].padStart(2, '0');
    return { value: `${us[3]}-${m}-${d}T00:00:00Z`, fallback: false };
  }
  // Last resort: now. The receipt is forced to needs_review so the user
  // notices the date is a guess.
  return { value: new Date().toISOString(), fallback: true };
}
