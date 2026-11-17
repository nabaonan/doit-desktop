import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InlineEditor from '@/components/doit/InlineEditor.vue'

describe('InlineEditor 进编辑态的焦点竞态回归', () => {
  it('挂载后立刻触发的瞬时 blur 不提交（保留编辑态）', () => {
    const wrapper = mount(InlineEditor, { props: { value: '旧标题' } })
    // 同步立刻失焦：模拟「右键菜单关闭瞬间的焦点回抢」引发的首 blu
    wrapper.find('input').trigger('blur')
    expect(wrapper.emitted('commit')).toBeUndefined()
    wrapper.unmount()
  })

  it('回车仍正常提交', () => {
    const wrapper = mount(InlineEditor, { props: { value: '旧标题' } })
    wrapper.find('input').setValue('新标题')
    wrapper.find('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('commit')?.[0]).toEqual(['新标题'])
    wrapper.unmount()
  })
})
