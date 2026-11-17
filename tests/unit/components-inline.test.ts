import { describe, expect, it } from 'vitest'
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

  it('失焦提交，且提交后不再重复触发 cancel', async () => {
    const w = mount(InlineEditor, { props: { value: '原标题' } })
    const input = w.get('input')
    await input.setValue('失焦标题')
    await input.trigger('blur')
    expect(w.emitted('commit')).toEqual([['失焦标题']])
    await input.trigger('keydown', { key: 'Escape' })
    expect(w.emitted('cancel')).toBeUndefined()
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
