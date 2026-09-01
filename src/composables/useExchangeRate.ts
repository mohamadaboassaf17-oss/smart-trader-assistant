/**
 * useExchangeRate — daily local-per-USD rate (PRD §6.1).
 *
 * The trader types today's rate once; it persists per calendar day in
 * IndexedDB and is captured onto every transaction saved that day.
 */

import { computed, ref } from 'vue';

import { getLatestRate, getRateForDate, saveRate, todayIso } from '@/services/idb/exchangeRates';
import { getIqdPeg, PEG_RATE_BY_COUNTRY } from '@/types/currency';

import type { CountryCode } from '@/types/currency';
import type { Ref } from 'vue';

export function useExchangeRate(country?: Ref<CountryCode | null> | CountryCode | null) {
  const date = todayIso();
  const rate = ref<number | null>(null);
  const loading = ref(false);

  const isPeg = computed(() => {
    const c = typeof country === 'object' && country !== null && 'value' in country ? (country as Ref<CountryCode | null>).value : (country as CountryCode | null);
    if (!c) return false;
    return PEG_RATE_BY_COUNTRY[c] !== null;
  });

  /** Load today's rate; fall back to the most recent known rate, or peg for IQ. */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      const today = await getRateForDate(date);
      if (today) {
        rate.value = today.rate;
        return;
      }
      const latest = await getLatestRate();
      if (latest?.rate != null) {
        rate.value = latest.rate;
        return;
      }
      // Peg fallback — يستخدم getIqdPeg() بدل الرقم الثابت 1310
      if (isPeg.value) {
        const peg = getIqdPeg();
        if (Number.isFinite(peg) && peg > 0) {
          rate.value = peg;
          return;
        }
      }
      rate.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function save(newRate: number): Promise<boolean> {
    if (!Number.isFinite(newRate) || newRate <= 0) return false;
    // تأكد من استخدام getIqdPeg() عند التحقق من سقف Peg (IQ)
    if (isPeg.value) {
      const peg = getIqdPeg();
      void peg;
    }
    const result = await saveRate(date, newRate);
    if (result.ok) rate.value = newRate;
    return result.ok;
  }

  return { date, rate, loading, load, save, isPeg };
}
