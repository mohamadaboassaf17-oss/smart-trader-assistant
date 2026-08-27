/**
 * Vue Router with M3 auth/onboarding guards.
 *
 * Meta:
 *   requiresAuth       — must have a restored session (default true)
 *   requiresOnboarding — must have a profile row (default true)
 *   showInNav          — appears in the AppShell bottom nav
 *
 * `ensureAuthReady()` runs once before the first decision so a cold offline
 * open restores the IndexedDB session without a redirect flash.
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import { ensureAuthReady, useAuth } from '@/composables/useAuth';
import {
  initSubscriptionWatch,
  isLockExemptRoute,
  useSubscription,
} from '@/composables/useSubscription';

const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@/features/auth/AuthView.vue'),
    meta: { title: 'تسجيل الدخول', requiresAuth: false, requiresOnboarding: false },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/features/onboarding/OnboardingView.vue'),
    meta: { title: 'الإعداد الأولي', requiresAuth: true, requiresOnboarding: false },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/app/views/HomeView.vue'),
    meta: { title: 'مساعد ذكي للتاجر', requiresAuth: false, requiresOnboarding: false },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/app/layouts/AppShell.vue'),
    meta: { title: 'لوحة التحكم', showInNav: true, featureView: 'dashboard' },
  },
  {
    path: '/sales',
    name: 'sales',
    component: () => import('@/app/layouts/AppShell.vue'),
    meta: { title: 'المبيعات', showInNav: true, featureView: 'sales' },
  },
  {
    path: '/purchases',
    name: 'purchases',
    component: () => import('@/app/layouts/AppShell.vue'),
    meta: { title: 'المشتريات', showInNav: true, featureView: 'purchases' },
  },
  {
    path: '/suppliers',
    name: 'suppliers',
    component: () => import('@/app/layouts/AppShell.vue'),
    meta: { title: 'الموردون', showInNav: true, featureView: 'suppliers' },
  },
  {
    path: '/inventory',
    name: 'inventory',
    component: () => import('@/app/layouts/AppShell.vue'),
    meta: { title: 'المخزون', showInNav: true, featureView: 'inventory' },
  },
  {
    path: '/obligations',
    name: 'obligations',
    component: () => import('@/app/layouts/AppShell.vue'),
    meta: { title: 'الالتزامات', showInNav: true, featureView: 'obligations' },
  },
  {
    path: '/notes',
    name: 'notes',
    component: () => import('@/app/layouts/AppShell.vue'),
    meta: { title: 'الملاحظات', showInNav: true, featureView: 'notes' },
  },
  {
    path: '/goals',
    name: 'goals',
    component: () => import('@/app/layouts/AppShell.vue'),
    meta: { title: 'الأهداف', showInNav: true, featureView: 'goals' },
  },
  {
    path: '/subscription',
    name: 'subscription',
    component: () => import('@/features/subscription/RenewalView.vue'),
    meta: { title: 'تجديد الاشتراك', requiresAuth: true, requiresOnboarding: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  await ensureAuthReady();
  // M6: populate lock/grace refs once (idempotent) before any decision.
  await initSubscriptionWatch();

  const needsAuth = to.meta.requiresAuth !== false;
  const needsProfile = to.meta.requiresOnboarding !== false;
  const { state } = useAuth();
  // readonly() unwraps refs — plain values here.
  const user = state.user;
  const profile = state.profile;

  if (needsAuth && !user) {
    return { name: 'auth', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  }
  // M8: home `/` is the public landing for unauthenticated users.
  // Authenticated users are sent to /dashboard (or onboarding if needed).
  if (to.name === 'home' && user && !profile) {
    return { name: 'onboarding' };
  }
  if (to.name === 'home' && user && profile) {
    return { name: 'dashboard' };
  }
  if (to.name === 'auth' && user) {
    // Signed-in users never see /auth — send them to the right home.
    return { name: 'dashboard' };
  }
  if (needsProfile && user && !profile) {
    return { name: 'onboarding' };
  }
  if (to.name === 'onboarding' && user && profile) {
    return { name: 'dashboard' };
  }
  // M6 subscription lock (PRD §4.5): purely navigational — engages only
  // after a confirmed-online sync proved expiry; offline devices without
  // such a check keep full access.
  if (user && profile && !isLockExemptRoute(to.name) && useSubscription().state.locked) {
    return { name: 'subscription' };
  }
  return true;
});

router.afterEach((to) => {
  const t = to.meta?.title as string | undefined;
  if (t && typeof document !== 'undefined') {
    document.title = `${t} — مساعد ذكي للتاجر`;
  }
});
