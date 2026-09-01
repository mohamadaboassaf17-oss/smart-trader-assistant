<script setup lang="ts">
/**
 * CameraCapture — M9 OCR capture (S transient).
 * getUserMedia environment camera + file fallback + canvas compress.
 * On capture: creates OcrDraft in Dexie; if online tries Vision immediately,
 * otherwise queues offline (pending) per decision.
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { useAuth } from '@/composables/useAuth';
import { useToast } from '@/composables/useToast';
import { createOcrDraft, updateOcrDraft } from '@/services/idb/ocrDrafts';
import { callVisionOcr } from '@/services/ocr/vision';
import { isOnline } from '@/services/sync/connectivity';

import type { CurrencyCode } from '@/types/currency';

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const { state: authState } = useAuth();

const isOpen = ref(false);
const previewUrl = ref<string | null>(null);
const previewBlob = ref<Blob | null>(null);
const processing = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
let stream: MediaStream | null = null;

function cleanupObjectUrl(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = null;
}

function stopStream(): void {
  if (stream) {
    stream.getTracks().forEach((tr) => tr.stop());
    stream = null;
  }
}

async function openCamera(): Promise<void> {
  isOpen.value = true;
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    stream = s;
    if (videoRef.value) {
      videoRef.value.srcObject = s;
      await videoRef.value.play().catch((e: unknown) => {
        console.warn('[CameraCapture] video play failed', e);
        toast.error(t('toasts.storageError'));
      });
    }
  } catch (e) {
    // Permission denied or no camera — fallback to file picker is still available
    console.warn('[ocr] getUserMedia failed, using file fallback', e);
    toast.error(t('toasts.storageError'));
  }
}

function close(): void {
  if (processing.value) return;
  stopStream();
  cleanupObjectUrl();
  previewBlob.value = null;
  isOpen.value = false;
}

async function captureFrame(): Promise<void> {
  const video = videoRef.value;
  if (!video || !stream) {
    fileInputRef.value?.click();
    return;
  }
  const canvas = document.createElement('canvas');
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const max = 1920;
  const scale = Math.min(1, max / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
  if (!blob) return;
  setPreview(blob);
  stopStream();
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  // Basic size cap 8MB
  if (file.size > 8 * 1024 * 1024) {
    toast.error(t('ocr.error'));
    return;
  }
  compressFile(file).then(setPreview).catch((e: unknown) => {
    console.warn('[CameraCapture] compress failed', e);
    toast.error(t('toasts.storageError'));
  });
  input.value = '';
}

async function compressFile(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    const max = 1920;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
    if (!blob) throw new Error('compress failed');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('loadImage failed'));
    img.src = src;
  });
}

function setPreview(blob: Blob): void {
  cleanupObjectUrl();
  previewBlob.value = blob;
  previewUrl.value = URL.createObjectURL(blob);
}

async function onProcess(): Promise<void> {
  const blob = previewBlob.value;
  if (!blob) return;
  processing.value = true;
  try {
    // Create draft with image
    const draft = await createOcrDraft(blob, authState.user?.id ?? undefined);

    if (!isOnline()) {
      toast.success(t('ocr.offlineQueued'));
      await router.push(`/ocr/${draft.id}`);
      close();
      return;
    }

    try {
      const vision = await callVisionOcr(blob);
      await updateOcrDraft(draft.id, {
        status: vision.rawText ? 'needs_review' : 'failed',
        rawText: vision.rawText,
        confidence: vision.confidence ?? undefined,
        draftAmountCents: vision.amountCents ?? undefined,
        draftCurrency: (vision.currencyGuess as unknown as CurrencyCode) ?? undefined,
        // noteCandidate → draftNote
        draftNote: vision.noteCandidate ?? undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ocr] vision failed', msg);
      await updateOcrDraft(draft.id, { status: 'failed', rawText: '' });
      toast.error(t('ocr.error'));
    }

    await router.push(`/ocr/${draft.id}`);
    close();
  } finally {
    processing.value = false;
  }
}

watch(isOpen, (open) => {
  if (!open) {
    stopStream();
  }
});

onBeforeUnmount(() => {
  stopStream();
  cleanupObjectUrl();
});

defineExpose({ openCamera, close });
</script>

<template>
  <div class="ocr-cap">
    <button
      type="button"
      class="ocr-cap__trigger"
      data-testid="ocr-trigger"
      :aria-label="t('ocr.captureTitle')"
      @click="openCamera"
    >
      {{ t('ocr.takePhoto') }}
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="ocr-cap__overlay" @click.self="close()">
        <div
          class="ocr-cap__dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="t('ocr.captureTitle')"
          data-testid="ocr-dialog"
        >
          <header class="ocr-cap__head">
            <h2 class="ocr-cap__title">{{ t('ocr.captureTitle') }}</h2>
            <button type="button" class="ocr-cap__close" :aria-label="t('common.close')" @click="close()">✕</button>
          </header>

          <p class="ocr-cap__hint">{{ t('ocr.captureHint') }}</p>

          <!-- Camera or preview -->
          <div class="ocr-cap__media">
            <video
              v-if="!previewUrl"
              ref="videoRef"
              class="ocr-cap__video"
              autoplay
              playsinline
              muted
              data-testid="ocr-video"
            />
            <img
              v-else
              :src="previewUrl"
              alt=""
              class="ocr-cap__preview"
              data-testid="ocr-preview"
            />
          </div>

          <div class="ocr-cap__actions">
            <template v-if="!previewUrl">
              <button type="button" class="ocr-cap__btn ocr-cap__btn--primary" data-testid="ocr-capture" @click="captureFrame">
                {{ t('ocr.takePhoto') }}
              </button>
              <button type="button" class="ocr-cap__btn" data-testid="ocr-pick-file" @click="fileInputRef?.click()">
                {{ t('ocr.pickFile') }}
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="ocr-cap__btn ocr-cap__btn--primary"
                data-testid="ocr-process"
                :disabled="processing"
                @click="onProcess"
              >
                {{ processing ? t('ocr.processing') : t('ocr.process') }}
              </button>
              <button type="button" class="ocr-cap__btn" :disabled="processing" @click="() => { cleanupObjectUrl(); previewBlob = null; openCamera(); }">
                {{ t('ocr.retake') }}
              </button>
            </template>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            capture="environment"
            class="ocr-cap__file"
            data-testid="ocr-file-input"
            @change="onFileChange"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ocr-cap__trigger {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-weight: 600;
}
.ocr-cap__overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 0.45);
}
.ocr-cap__dialog {
  inline-size: 100%;
  max-inline-size: 520px;
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  padding: var(--space-5) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.ocr-cap__head { display:flex; align-items:center; justify-content:space-between; }
.ocr-cap__title { font-size: var(--font-size-lg); }
.ocr-cap__close { min-inline-size: var(--tap-target-min); min-block-size: var(--tap-target-min); border:none; background:transparent; }
.ocr-cap__hint { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.ocr-cap__media { background: var(--color-surface-2); border-radius: var(--radius-md); overflow:hidden; aspect-ratio: 4/3; display:grid; place-items:center; }
.ocr-cap__video, .ocr-cap__preview { inline-size: 100%; block-size: 100%; object-fit: cover; }
.ocr-cap__actions { display:grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.ocr-cap__btn { min-block-size: var(--tap-target-min); border-radius: var(--radius-md); border:1px solid var(--color-border-strong); background: var(--color-surface); font-weight:600; }
.ocr-cap__btn--primary { background: var(--color-brand-700); color: var(--color-text-inverse); border:none; }
.ocr-cap__file { display:none; }
</style>
