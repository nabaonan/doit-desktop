import { liveSubs } from './taskTree'
import type { TaskNode } from './types'

export const HOLD_DELAY = 150
export const FILL_DUR = 900
export const CLICK_SUPPRESS_MS = 500

export type HoldPhase = 'idle' | 'pending' | 'filling' | 'completed' | 'rolledback'

export interface HoldEvent {
  type: 'down' | 'timer' | 'up' | 'cancel' | 'tick'
  at: number
  progress?: number
}

export interface HoldContext {
  canComplete: boolean
  /** 长按起算后到「开始填充」的延迟，默认 HOLD_DELAY */
  holdDelay?: number
  /** 填充总时长，默认 FILL_DUR */
  fillDuration?: number
}

/** 纯状态：DOM 计时、填充动画与 click 抑制交给 useHoldToComplete。 */
export function nextHold(phase: HoldPhase, event: HoldEvent, ctx: HoldContext): HoldPhase {
  if (!ctx.canComplete) return 'idle'
  switch (event.type) {
    case 'down':
      return 'pending'
    case 'cancel':
      return 'idle'
    case 'timer':
      if (phase === 'pending') return 'filling'
      if (phase === 'filling') return 'completed'
      return phase
    case 'up':
      if (phase === 'pending') return 'idle'
      if (phase === 'filling') return 'rolledback'
      return phase
    case 'tick':
      return phase === 'filling' ? 'filling' : phase
    default:
      return phase
  }
}

export function canComplete(n: TaskNode): boolean {
  return !n.done && n.deletedAt === null && liveSubs(n).length === 0
}

/** 0 → 1 的填充进度，供 .pfill 宽度使用。 */
export function holdProgress(startedAt: number, now: number, duration = FILL_DUR): number {
  if (now <= startedAt) return 0
  return Math.min(1, (now - startedAt) / duration)
}
