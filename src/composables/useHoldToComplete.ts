import { ref } from 'vue'
import {
  CLICK_SUPPRESS_MS,
  FILL_DUR,
  HOLD_DELAY,
  canComplete,
  holdProgress,
  nextHold,
} from '@/domain/completion'
import type { HoldPhase } from '@/domain/completion'
import { liveSubs } from '@/domain/taskTree'
import type { TaskNode } from '@/domain/types'

/** 全局 click 抑制窗口：长按结束后 500ms 内不响应卡片展开，避免误触。 */
let suppressClickUntil = 0

export function isClickSuppressed(): boolean {
  return Date.now() < suppressClickUntil
}

export interface HoldToCompleteOptions {
  getNode: () => TaskNode | null
  onComplete: (uid: string) => void
  notify?: (message: string) => void
  holdDelay?: number
  fillDuration?: number
}

/**
 * 长按完成状态机：150ms 起算 → 900ms 填满 → 标记完成；中途松手平滑回退且不改状态。
 * DOM 侧的 .pfill 宽度由 progress 驱动，业务完成动作交给 store。
 */
export function useHoldToComplete(opts: HoldToCompleteOptions) {
  const phase = ref<HoldPhase>('idle')
  const progress = ref(0)
  let delayTimer: ReturnType<typeof setTimeout> | null = null
  let fillTimer: ReturnType<typeof setTimeout> | null = null
  let raf = 0
  let startedAt = 0
  const duration = opts.fillDuration ?? FILL_DUR

  function clearTimers(): void {
    if (delayTimer) clearTimeout(delayTimer)
    if (fillTimer) clearTimeout(fillTimer)
    if (raf) cancelAnimationFrame(raf)
    delayTimer = fillTimer = null
    raf = 0
  }

  function rollback(): void {
    clearTimers()
    progress.value = 0
    phase.value = 'rolledback'
    window.setTimeout(() => { if (phase.value === 'rolledback') phase.value = 'idle' }, 180)
  }

  function transition(event: Parameters<typeof nextHold>[1]): void {
    const node = opts.getNode()
    const ctx = { canComplete: node ? canComplete(node) : false, holdDelay: opts.holdDelay ?? HOLD_DELAY }
    phase.value = nextHold(phase.value, event, ctx)
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return
    const node = opts.getNode()
    if (!node) return
    if (!canComplete(node)) {
      if (!node.done && liveSubs(node).length > 0) opts.notify?.('请完成子任务后自动完成')
      return
    }
    clearTimers()
    progress.value = 0
    transition({ type: 'down', at: Date.now() })
    delayTimer = setTimeout(() => {
      transition({ type: 'timer', at: Date.now() })
      if (phase.value !== 'filling') return
      startedAt = Date.now()
      const tick = () => {
        progress.value = holdProgress(startedAt, Date.now(), duration)
        transition({ type: 'tick', at: Date.now() })
        if (phase.value === 'filling') raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      fillTimer = setTimeout(() => {
        transition({ type: 'timer', at: Date.now() })
        if (phase.value === 'completed') {
          clearTimers()
          progress.value = 1
          opts.onComplete(node.uid)
          suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS
          window.setTimeout(() => { progress.value = 0; phase.value = 'idle' }, 260)
        }
      }, duration)
    }, opts.holdDelay ?? HOLD_DELAY)
  }

  function onPointerUp(): void {
    clearTimers()
    if (phase.value === 'filling') {
      suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS
      transition({ type: 'up', at: Date.now() })
      rollback()
    } else {
      phase.value = 'idle'
      progress.value = 0
    }
  }

  function onPointerCancel(): void {
    clearTimers()
    if (phase.value === 'filling') rollback()
    else { phase.value = 'idle'; progress.value = 0 }
  }

  return { phase, progress, onPointerDown, onPointerUp, onPointerCancel }
}
