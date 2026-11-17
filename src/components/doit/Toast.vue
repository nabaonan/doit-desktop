<script setup lang="ts">
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()
</script>

<template>
  <div id="toast" :class="{ show: Boolean(ui.toast) }">{{ ui.toast }}</div>
</template>
