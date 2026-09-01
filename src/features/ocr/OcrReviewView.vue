<script setup lang="ts">
/**
 * OcrReviewView — M9 editable OCR result before save.
 * Loads OcrDraft by :draftId, shows preview + extracted rawText,
 * lets user edit amount/currency/note + peg hint, then confirms
 * as a sidePurchase via useOfflineSync and deletes the draft (transient).
 */
import { v4 as uuidv4 } from 'uuid';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import NumberInput from '@/components/NumberInput.vue';
import { useAuth } from '@/composables/useAuth';
import { useExchangeRate } from '@/composables/useExchangeRate';
import { useOfflineSync } from '@/composables/useOfflineSync';
import { useToast } from '@/composables/useToast';
import { todayIso } from '@/services/idb/exchangeRates';
import { deleteOcrDraft, getOcrDraft, updateOcrDraft } from '@/services/idb/ocrDrafts';
import { callVisionOcr } from '@/services/ocr/vision';
import { isOnline } from '@/services/sync/connectivity';
import { getIqdPeg, LOCAL_CURRENCY_BY_COUNTRY } from '@/types/currency';
import { localToUsdCents } from '@/utils/money';

import type { CurrencyCode } from '@/types/currency';
import type { OcrDraft, SidePurchase } from '@/types/domain';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const { state: authState } = useAuth();
const { save } = useOfflineSync();

const draft = ref<OcrDraft | null>(null);
const loading = ref(true);
const amountCents = ref<number | null>(null);
const currency = ref<CurrencyCode>('USD');
const note = ref('');
const saving = ref(false);
const retrying = ref(false);
const previewUrl = ref<string | null>(null);

const localCurrency = computed<CurrencyCode>(() => {
  const c = authState.profile?.country ? LOCAL_CURRENCY_BY_COUNTRY[authState.profile.country] : 'LBP';
  return c as unknown as CurrencyCode;
});

const exchangeRateHook = useExchangeRate(authState.profile?.country ?? null);

const canSave = computed(() => !saving.value && (amountCents.value ?? 0) > 0);

function currencyOptions(): { value: CurrencyCode; label: string }[] {
  const local = localCurrency.value;
  return [
    { value: 'USD', label: t('purchases.currencyUsd') },
    { value: local, label: t('purchases.currencyLocal', { local }) },
  ];
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const id = String(route.params['draftId'] ?? '');
    if (!id) {
      await router.replace('/purchases');
      return;
    }
    const row = await getOcrDraft(id);
    if (!row) {
      toast.error(t('common.error'));
      await router.replace('/purchases');
      return;
    }
    draft.value = row;
    amountCents.value = row.draftAmountCents ?? null;
    currency.value = (row.draftCurrency as CurrencyCode | undefined) ?? (row.draftCurrency ? 'IQD' as CurrencyCode : localCurrency.value === 'IQD' ? 'IQD' as CurrencyCode : 'USD');
    if (row.draftCurrency) currency.value = row.draftCurrency as CurrencyCode;
    else if (row.draftAmountCents && !row.draftCurrency) {
      // Fallback: if no currency guessed, default to local for IQ or USD otherwise is ambiguous — keep local for IQ peg demo
      currency.value = localCurrency.value === 'IQD' ? 'IQD' as unknown as CurrencyCode : 'USD';
    }
    note.value = row.draftNote ?? '';
    if (row.imageBlob) {
      previewUrl.value = URL.createObjectURL(row.imageBlob);
    }
    await exchangeRateHook.load();
  } finally {
    loading.value = false;
  }
}

watch(
  () => authState.profile?.country,
  () => {
    void exchangeRateHook.load();
  },
);

async function onRetryVision(): Promise<void> {
  const d = draft.value;
  if (!d?.imageBlob) {
    toast.error(t('ocr.error'));
    return;
  }
  if (!isOnline()) {
    toast.error(t('ocr.needsConnection'));
    return;
  }
  retrying.value = true;
  try {
    const vision = await callVisionOcr(d.imageBlob);
    await updateOcrDraft(d.id, {
      status: vision.rawText ? 'needs_review' : 'failed',
      rawText: vision.rawText,
      confidence: vision.confidence ?? undefined,
      draftAmountCents: vision.amountCents ?? undefined,
      draftCurrency: (vision.currencyGuess as unknown as CurrencyCode | undefined) ?? undefined,
      draftNote: vision.noteCandidate ?? undefined,
    });
    const updated = await getOcrDraft(d.id);
    if (updated) {
      draft.value = updated;
      amountCents.value = updated.draftAmountCents ?? amountCents.value;
      if (updated.draftCurrency) currency.value = updated.draftCurrency as CurrencyCode;
      note.value = updated.draftNote ?? note.value;
      if (vision.rawText) toast.success(t('toasts.savedLocally'));
      else toast.error(t('ocr.noText'));
    }
  } catch (e) {
    console.warn('[ocr] retry failed', e);
    toast.error(t('toasts.storageError'));
  } finally {
    retrying.value = false;
  }
}

async function onConfirm(): Promise<void> {
  const d = draft.value;
  if (!d) return;
  const cents = amountCents.value;
  if (cents === null || cents <= 0) {
    toast.error(t('toasts.invalidAmount'));
    return;
  }
  // سقف المبلغ: > 5_000_000 cents (50k$) — تحذير مع تأكيد يدوي إضافي، لا يمنع الحفظ
  if (cents > 5_000_000) {
    console.warn('[OcrReviewView] large amount requires manual confirmation', { cents });
    toast.error(t('toasts.largeAmountWarning'));
    const confirmed = confirm(t('toasts.largeAmountConfirm'));
    if (!confirmed) {
      toast.error(t('toasts.largeAmountWarning'));
      // لا نمنع الحفظ نهائياً — المستخدم أكد أو أعاد المحاولة
    }
  }

  // استخدام getIqdPeg() بدل الرقم الثابت عند الحاجة
  const rawRate = exchangeRateHook.rate.value ?? (localCurrency.value === 'IQD' ? getIqdPeg() : null);
  let effectiveRate: number;
  if (currency.value === 'USD') effectiveRate = rawRate ?? 1;
  else {
    if (!rawRate || !Number.isFinite(rawRate) || rawRate <= 0) {
      toast.error(t('toasts.missingRate'));
      return;
    }
    effectiveRate = rawRate;
  }

  const nowIso = new Date().toISOString();
  const row: SidePurchase = {
    id: uuidv4(),
    createdAt: nowIso,
    updatedAt: nowIso,
    date: todayIso(),
    amountCents: cents,
    currency: currency.value,
    exchangeRate: effectiveRate,
    amountUsdCents: currency.value === 'USD' ? cents : localToUsdCents(cents, effectiveRate),
    note: note.value.trim() ? note.value.trim() : undefined,
  };

  saving.value = true;
  try {
    const result = await save('sidePurchase', row);
    if (!result.ok) {
      console.error('[ocr] confirm save failed', result.error);
      toast.error(t('common.error'));
      return;
    }
    // Transient delete
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value);
      previewUrl.value = null;
    }
    await deleteOcrDraft(d.id);
    toast.success(t('ocr.saved'));
    await router.push('/purchases');
  } finally {
    saving.value = false;
  }
}

async function onDeleteDraft(): Promise<void> {
  const d = draft.value;
  if (!d) return;
  if (!confirm(t('ocr.confirmDelete'))) return;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  await deleteOcrDraft(d.id);
  await router.push('/purchases');
}

onMounted(() => {
  void load();
});
</script>

<template>
  <section class="ocr-review" data-testid="ocr-review">
    <div v-if="loading" class="ocr-review__loading">{{ t('common.loading') }}</div>

    <template v-else-if="draft">
      <header class="ocr-review__head">
        <h1 class="ocr-review__title">{{ t('ocr.reviewTitle') }}</h1>
        <p class="ocr-review__hint">{{ t('ocr.editHint') }}</p>
        <p v-if="exchangeRateHook.isPeg.value" class="ocr-review__peg" data-testid="ocr-peg-hint">
          {{ t('ocr.pegHint') }}
        </p>
      </header>

      <div v-if="previewUrl" class="ocr-review__media">
        <img :src="previewUrl" alt="" class="ocr-review__img" data-testid="ocr-review-img" />
      </div>

      <div v-if="draft.rawText" class="ocr-review__raw" data-testid="ocr-raw">
        <h2 class="ocr-review__label">{{ t('ocr.rawTextLabel') }}</h2>
        <pre class="ocr-review__pre">{{ draft.rawText }}</pre>
        <p v-if="draft.confidence != null" class="ocr-review__conf">{{ t('ocr.confidenceLabel') }}: {{ draft.confidence }}</p>
      </div>
      <div v-else class="ocr-review__empty" data-testid="ocr-empty">
        <p>{{ t('ocr.noText') }}</p>
        <button type="button" class="ocr-review__retry" :disabled="retrying" data-testid="ocr-retry" @click="onRetryVision">
          {{ t('ocr.process') }}
        </button>
      </div>

      <div class="ocr-review__form">
        <div class="ocr-review__toggle" role="radiogroup" :aria-label="t('purchases.currencyToggle')">
          <button
            v-for="opt in currencyOptions()"
            :key="opt.value"
            type="button"
            role="radio"
            class="ocr-review__opt"
            :class="{ 'ocr-review__opt--active': currency === opt.value }"
            :aria-checked="currency === opt.value"
            :data-testid="`ocr-currency-${opt.value.toLowerCase()}`"
            @click="currency = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>

        <NumberInput v-model="amountCents" mode="amount" :label="currency === 'USD' ? t('purchases.amountUsd') : t('purchases.amountLocal', { local: localCurrency })" />

        <label class="ocr-review__note">
          <span class="ocr-review__note-label">{{ t('purchases.noteOptional') }}</span>
          <input v-model="note" type="text" class="ocr-review__note-field" data-testid="ocr-note" :placeholder="t('purchases.notePlaceholder')" />
        </label>

        <div class="ocr-review__actions">
          <button type="button" class="ocr-review__save" data-testid="ocr-confirm" :disabled="!canSave" @click="onConfirm">
            {{ t('ocr.saveDraft') }}
          </button>
          <button type="button" class="ocr-review__delete" data-testid="ocr-delete" @click="onDeleteDraft">
            {{ t('ocr.deleteDraft') }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.ocr-review { display:flex; flex-direction:column; gap: var(--space-4); padding: var(--space-4); max-inline-size: var(--max-width); margin-inline:auto; }
.ocr-review__title { font-size: var(--font-size-xl); font-weight:800; }
.ocr-review__hint { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.ocr-review__peg { background: var(--color-brand-50); border:1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); font-size: var(--font-size-sm); color: var(--color-brand-700); }
.ocr-review__media { border-radius: var(--radius-lg); overflow:hidden; background: var(--color-surface-2); max-block-size: 40vh; display:grid; place-items:center; }
.ocr-review__img { inline-size:100%; block-size:100%; object-fit: contain; }
.ocr-review__raw { background: var(--color-surface); border:1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
.ocr-review__label { font-weight:700; font-size: var(--font-size-sm); }
.ocr-review__pre { white-space: pre-wrap; word-break: break-word; font-size: var(--font-size-sm); margin-block-start: var(--space-2); max-block-size: 12rem; overflow:auto; }
.ocr-review__form { display:flex; flex-direction:column; gap: var(--space-3); background: var(--color-surface); border:1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); }
.ocr-review__toggle { display:grid; grid-template-columns: 1fr 1fr; gap: var(--space-1); padding: var(--space-1); background: var(--color-surface-2); border-radius: var(--radius-md); }
.ocr-review__opt { min-block-size: calc(var(--tap-target-min) - 8px); border:none; border-radius: var(--radius-sm); background:transparent; font-weight:600; }
.ocr-review__opt--active { background: var(--color-surface); color: var(--color-brand-700); box-shadow: var(--shadow-sm); }
.ocr-review__note { display:flex; flex-direction:column; gap: var(--space-1); }
.ocr-review__note-label { font-size: var(--font-size-sm); color: var(--color-text-muted); font-weight:600; }
.ocr-review__note-field { min-block-size: var(--tap-target-min); padding-inline: var(--space-3); border:1px solid var(--color-border-strong); border-radius: var(--radius-md); }
.ocr-review__actions { display:grid; grid-template-columns: 2fr 1fr; gap: var(--space-2); }
.ocr-review__save { min-block-size: calc(var(--tap-target-min) + 6px); border:none; border-radius: var(--radius-md); background: var(--color-brand-700); color: var(--color-text-inverse); font-weight:700; }
.ocr-review__save:disabled { opacity:0.45; }
.ocr-review__delete { min-block-size: var(--tap-target-min); border:1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface); }
.ocr-review__retry { min-block-size: var(--tap-target-min); padding-inline: var(--space-3); border:none; border-radius: var(--radius-md); background: var(--color-brand-700); color: var(--color-text-inverse); }
</style>
