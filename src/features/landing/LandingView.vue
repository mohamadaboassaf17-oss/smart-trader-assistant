<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="landing" dir="rtl">
    <!-- Hero -->
    <header class="landing__hero" role="banner">
      <p class="landing__badge" data-testid="landing-badge">{{ t('landing.badge') }}</p>
      <h1 class="landing__title" data-testid="landing-title">{{ t('landing.heroTitle') }}</h1>
      <p class="landing__subtitle">{{ t('landing.heroSubtitle') }}</p>
      <div class="landing__ctas">
        <router-link
          to="/auth"
          class="landing__cta landing__cta--primary"
          data-testid="landing-cta-primary"
        >
          {{ t('landing.ctaPrimary') }}
        </router-link>
        <router-link
          to="/auth"
          class="landing__cta landing__cta--secondary"
          data-testid="landing-cta-secondary"
        >
          {{ t('landing.ctaSecondary') }}
        </router-link>
      </div>
      <p class="landing__trust">{{ t('landing.trustLine') }}</p>
    </header>

    <!-- Pricing -->
    <section class="landing__pricing" aria-labelledby="pricing-title" data-testid="landing-pricing">
      <h2 id="pricing-title" class="landing__section-title">{{ t('landing.priceTitle') }}</h2>
      <div class="landing__price-card">
        <p class="landing__price">
          <span class="landing__price-amount">{{ t('landing.priceAmount') }}</span>
          <span class="landing__price-period">{{ t('landing.pricePeriod') }}</span>
        </p>
        <p class="landing__price-hint">{{ t('landing.priceHint') }}</p>
        <router-link
          to="/auth"
          class="landing__cta landing__cta--primary landing__cta--block"
          data-testid="landing-price-cta"
        >
          {{ t('landing.ctaPrimary') }}
        </router-link>
      </div>
    </section>

    <!-- Features -->
    <section
      class="landing__features"
      aria-labelledby="features-title"
      data-testid="landing-features"
    >
      <h2 id="features-title" class="landing__section-title">{{ t('landing.featuresTitle') }}</h2>
      <ul class="landing__grid">
        <li class="landing__feature">
          <h3 class="landing__feature-title">{{ t('landing.featureOffline') }}</h3>
          <p class="landing__feature-desc">{{ t('landing.featureOfflineDesc') }}</p>
        </li>
        <li class="landing__feature">
          <h3 class="landing__feature-title">{{ t('landing.featureDual') }}</h3>
          <p class="landing__feature-desc">{{ t('landing.featureDualDesc') }}</p>
        </li>
        <li class="landing__feature">
          <h3 class="landing__feature-title">{{ t('landing.featureFast') }}</h3>
          <p class="landing__feature-desc">{{ t('landing.featureFastDesc') }}</p>
        </li>
        <li class="landing__feature">
          <h3 class="landing__feature-title">{{ t('landing.featureSecure') }}</h3>
          <p class="landing__feature-desc">{{ t('landing.featureSecureDesc') }}</p>
        </li>
      </ul>
    </section>

    <!-- How it works -->
    <section class="landing__how" aria-labelledby="how-title" data-testid="landing-how">
      <h2 id="how-title" class="landing__section-title">{{ t('landing.howTitle') }}</h2>
      <ol class="landing__steps">
        <li class="landing__step">
          <h3 class="landing__step-title">{{ t('landing.howStep1') }}</h3>
          <p class="landing__step-desc">{{ t('landing.howStep1Desc') }}</p>
        </li>
        <li class="landing__step">
          <h3 class="landing__step-title">{{ t('landing.howStep2') }}</h3>
          <p class="landing__step-desc">{{ t('landing.howStep2Desc') }}</p>
        </li>
        <li class="landing__step">
          <h3 class="landing__step-title">{{ t('landing.howStep3') }}</h3>
          <p class="landing__step-desc">{{ t('landing.howStep3Desc') }}</p>
        </li>
      </ol>
    </section>

    <!-- FAQ -->
    <section class="landing__faq" aria-labelledby="faq-title" data-testid="landing-faq">
      <h2 id="faq-title" class="landing__section-title">{{ t('landing.faqTitle') }}</h2>
      <div class="landing__faq-item">
        <h3 class="landing__faq-q">{{ t('landing.faqOfflineQ') }}</h3>
        <p class="landing__faq-a">{{ t('landing.faqOfflineA') }}</p>
      </div>
      <div class="landing__faq-item">
        <h3 class="landing__faq-q">{{ t('landing.faqCurrencyQ') }}</h3>
        <p class="landing__faq-a">{{ t('landing.faqCurrencyA') }}</p>
      </div>
      <div class="landing__faq-item">
        <h3 class="landing__faq-q">{{ t('landing.faqPaymentQ') }}</h3>
        <p class="landing__faq-a">{{ t('landing.faqPaymentA') }}</p>
      </div>
    </section>

    <footer class="landing__footer" role="contentinfo">
      <p class="landing__footer-tagline">{{ t('landing.footerTagline') }}</p>
      <p class="landing__footer-contact">{{ t('landing.footerContact') }}</p>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  max-width: var(--max-width);
  margin-inline: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  background: var(--color-bg);
}

.landing__hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block: var(--space-8);
}

.landing__badge {
  display: inline-block;
  align-self: center;
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.landing__title {
  font-size: var(--font-size-3xl);
  font-weight: 800;
  line-height: 1.2;
  color: var(--color-text);
}

.landing__subtitle {
  color: var(--color-text-muted);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  max-width: 40ch;
  margin-inline: auto;
}

.landing__ctas {
  display: grid;
  gap: var(--space-3);
  margin-block-start: var(--space-4);
}

@media (min-width: 640px) {
  .landing__ctas {
    grid-template-columns: 1fr 1fr;
  }
}

.landing__cta {
  min-block-size: var(--tap-target-min);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-weight: 700;
  text-decoration: none;
  font-size: var(--font-size-sm);
  padding-inline: var(--space-4);
}

.landing__cta--primary {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
}

.landing__cta--secondary {
  background: var(--color-surface);
  color: var(--color-brand-700);
  border: 1px solid var(--color-border-strong);
}

.landing__cta--block {
  width: 100%;
}

.landing__trust {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.landing__section-title {
  font-size: var(--font-size-xl);
  font-weight: 800;
  color: var(--color-text);
  margin-block-end: var(--space-4);
  text-align: center;
}

.landing__price-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-6);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.landing__price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--space-1);
}

.landing__price-amount {
  font-size: var(--font-size-3xl);
  font-weight: 800;
  color: var(--color-brand-700);
}

.landing__price-period {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.landing__price-hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.landing__grid {
  display: grid;
  gap: var(--space-4);
  list-style: none;
  padding: 0;
}

@media (min-width: 640px) {
  .landing__grid {
    grid-template-columns: 1fr 1fr;
  }
}

.landing__feature {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.landing__feature-title {
  font-weight: 700;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.landing__feature-desc {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  margin-block-start: var(--space-1);
  line-height: var(--line-height-base);
}

.landing__steps {
  display: grid;
  gap: var(--space-4);
  list-style: none;
  padding: 0;
  counter-reset: step;
}

.landing__step {
  position: relative;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  padding-inline-start: calc(var(--space-4) + 2.5rem);
}

.landing__step::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  inset-inline-start: var(--space-4);
  inset-block-start: var(--space-4);
  inline-size: 2rem;
  block-size: 2rem;
  display: grid;
  place-items: center;
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  border-radius: var(--radius-full);
  font-weight: 700;
  font-size: var(--font-size-sm);
}

.landing__step-title {
  font-weight: 700;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.landing__step-desc {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  margin-block-start: var(--space-1);
}

.landing__faq-item {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-block-end: var(--space-3);
}

.landing__faq-q {
  font-weight: 700;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.landing__faq-a {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  margin-block-start: var(--space-2);
  line-height: var(--line-height-base);
}

.landing__footer {
  text-align: center;
  border-block-start: 1px solid var(--color-border);
  padding-block: var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.landing__footer-tagline {
  font-weight: 600;
  color: var(--color-text);
}

.landing__footer-contact {
  margin-block-start: var(--space-1);
}
</style>
