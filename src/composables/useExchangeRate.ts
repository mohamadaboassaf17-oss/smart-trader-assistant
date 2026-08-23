/**
 * useExchangeRate — daily local-per-USD rate (PRD §6.1).
 *
 * The trader types today's rate once; it persists per calendar day in
 * IndexedDB and is captured onto every transaction saved that day.
 */

import { ref } from 'vue';

import { getLatestRate, getRateForDate, saveRate, todayIso } from '@/services/idb/exchangeRates';

export function useExchangeRate() {
  const date = todayIso();
  const rate = ref<number | null>(null);
  const loading = ref(false);

  /** Load today's rate; fall back to the most recent known rate. */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      const today = await getRateForDate(date);
      if (today) {
        rate.value = today.rate;
        return;
      }
      const latest = await getLatestRate();
      rate.value = latest?.rate ?? null;
    } finally {
      loading.value = false;
    }
  }

  async function save(newRate: number): Promise<boolean> {
    const result = await saveRate(date, newRate);
    if (result.ok) rate.value = newRate;
    return result.ok;
  }

  return { date, rate, loading, load, save };
}
