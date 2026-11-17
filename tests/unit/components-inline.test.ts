import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import InlineEditor from '@/components/doit/InlineEditor.vue'
import InlineSubAdder from '@/components/doit/InlineSubAdder.vue'

describe('InlineEditor 内联编辑', () => {
  it('Enter 提交当前草稿并阻止默认行为', async () => {
    const w = mount(InlineEditor, { props: { value: '原标题' } })
    const input = w.get('input')
    await input.setValue('新标题')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('commit')).toEqual([['新标题']])
    expect(w.emitted('cancel')).toBeUndefined()
  })

  it('Escape 取消且不提交', async () => {
    const w = mount(InlineEditor, { props: { value: '原标题' } })
    await w.get('input').setValue('改动')
    await w.get('input').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('commit')).toBeUndefined()
  })

  it('焦点竞态窗口内失焦不提交；越过后真实失焦提交，且提交后不再触发 cancel', async () => {
    // 回归：从右键菜单进编辑时，菜单关闭的焦点回抢会在挂载后极短时间内触发一次 blur，
    // 若立即提交会「一点编辑就被退出」。窗口内（<200ms）失焦应保留编辑态，真实失焦才提交。
    vi.useFakeTimers()
    try {
      const w = mount(InlineEditor, { props: { value: '原标题' } })
      const input = w.get('input')
      await input.setValue('失焦标题')
      await input.trigger('blur')
      expect(w.emitted('commit')).toBeUndefined()      // 窗口内不提交
      vi.advanceTimersByTime(220)                       // 越过竞态窗口
      await input.trigger('blur')
      expect(w.emitted('commit')).toEqual([['失焦标题']])
      await input.trigger('keydown', { key: 'Escape' })
      expect(w.emitted('cancel')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Enter 后再 blur 只提交一次', async () => {
    const w = mount(InlineEditor, { props: { value: '原标题' } })
    const input = w.get('input')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('blur')
    expect(w.emitted('commit')).toHaveLength(1)
  })
})

describe('InlineSubAdder 内联子任务', () => {
  it('Enter 提交草稿', async () => {
    const w = mount(InlineSubAdder)
    const input = w.get('#inlineSubInput')
    await input.setValue('子任务 A')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('commit')).toEqual([['子任务 A']])
  })

  it('Escape 取消', async () => {
    const w = mount(InlineSubAdder)
    await w.get('#inlineSubInput').setValue('草稿')
    await w.get('#inlineSubInput').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('commit')).toBeUndefined()
  })

  it('提示继承父任务分类与优先级', () => {
    const w = mount(InlineSubAdder)
    expect(w.get('.inline-sub-hint').text()).toContain('继承父任务分类与优先级')
  })
})
