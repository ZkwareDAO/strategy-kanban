<template>
  <div class="indicators-section">
    <h3 class="section-title">技术指标</h3>
    <div class="indicators-grid">
      <div
        v-for="indicator in indicators"
        :key="indicator.name"
        class="indicator-card"
      >
        <div class="indicator-name">{{ indicator.name }}</div>
        <div class="indicator-value">{{ indicator.value }}</div>
        <div v-if="indicator.signal" class="indicator-signal">{{ indicator.signal }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TechnicalIndicator } from '@/models/detail'

defineProps<{
  indicators: TechnicalIndicator[]
}>()
</script>

<style scoped lang="scss">
.indicators-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 15px 0;
}

.indicators-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 15px;
}

.indicator-card {
  background: #f9fafb;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.indicator-name {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 5px;
}

.indicator-value {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 5px;
}

.indicator-signal {
  font-size: 12px;
  color: #10b981;
}
</style>