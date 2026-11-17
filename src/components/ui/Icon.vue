<script setup lang="ts">
import { computed } from 'vue'
import { ICONS } from '@/constants/icons'

const props = withDefaults(defineProps<{ name: string; size?: number; cls?: string }>(), {
  size: 18,
  cls: '',
})
const body = computed(() => ICONS[props.name] ?? '')
</script>

<template>
  <svg :class="props.cls" viewBox="0 0 24 24" :width="props.size" :height="props.size" v-html="body" />
</template>
