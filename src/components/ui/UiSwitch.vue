<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const props = withDefaults(defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>(), {
  disabled: false,
})
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()
</script>

<template>
  <SwitchRoot
    :model-value="props.modelValue"
    :disabled="props.disabled"
    :aria-label="props.label"
    class="switch"
    :class="{ on: props.modelValue }"
    @update:model-value="(v) => emit('update:modelValue', Boolean(v))"
  >
    <SwitchThumb class="switch-thumb" />
  </SwitchRoot>
</template>
