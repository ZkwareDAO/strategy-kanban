import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'StrategyOverview',
      component: () => import('@/views/StrategyOverview.vue'),
    },
    {
      path: '/detail/:strategy/:symbol',
      name: 'TokenDetail',
      component: () => import('@/views/TokenDetail.vue'),
      props: true,
    },
    {
      path: '/detail-v2/:strategy/:symbol',
      name: 'TokenDetailV2',
      component: () => import('@/views/TokenDetailV2.vue'),
      props: true,
    },
    {
      path: '/backtest-detail/:strategy/:symbol',
      name: 'BacktestDetail',
      component: () => import('@/views/BacktestDetail.vue'),
      props: true,
    },
    {
      path: '/performance-detail/:strategyName',
      name: 'PerformanceDetail',
      component: () => import('@/views/PerformanceDetail.vue'),
      props: true,
    },
    {
      path: '/backtest-token-list',
      name: 'BacktestTokenList',
      component: () => import('@/views/BacktestTokenList.vue'),
    },
    {
      path: '/replay-token-list',
      name: 'ReplayTokenList',
      component: () => import('@/views/ReplayTokenList.vue'),
    },
  ],
})

export default router