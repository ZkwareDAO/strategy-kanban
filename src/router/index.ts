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
  ],
})

export default router