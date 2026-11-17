<script setup lang="ts">
const props = defineProps<{ progress: number }>()
</script>

<template>
  <span class="pfill"><i :style="{ width: `${Math.round(props.progress * 100)}%` }" /></span>
</template>
