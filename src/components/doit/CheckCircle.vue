<script setup lang="ts">
/** 圆形勾选控件：外圈纯圆；未完成为空心圆，完成态为圆底 + 白色 SVG 曲线对勾（无矩形描边）。 */
const props = withDefaults(defineProps<{ done: boolean; readonly?: boolean; title?: string }>(), {
  readonly: false,
  title: '',
})

const emit = defineEmits<{ toggle: [] }>()

function activate(): void {
  if (!props.readonly) emit('toggle')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  e.stopPropagation()
  activate()
}
</script>

<template>
  <span
    class="check-dot"
    :class="{ on: props.done, readonly: props.readonly, 'dash-circle': props.readonly && !props.done }"
    :role="props.readonly ? 'img' : 'button'"
    :aria-checked="props.done"
    :aria-readonly="props.readonly"
    :tabindex="props.readonly ? -1 : 0"
    :title="props.title"
    @click.stop="activate"
    @keydown="onKeydown"
    @pointerdown.stop
  >
    <!-- 父任务只读圈的虚线用 SVG stroke-dasharray 绘制：CSS border:dashed + border-radius
         在 WebKit(WKWebView) 下会渲染成稀疏长弧，与 Blink(web 原型) 不一致；SVG 虚线跨平台均匀一致。 -->
    <svg v-if="props.readonly && !props.done" class="dash-ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="4 3" stroke-linecap="round" />
    </svg>
    <svg v-if="props.done" class="check-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.5 12.8l4.2 4.2L18.5 7.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
</template>
