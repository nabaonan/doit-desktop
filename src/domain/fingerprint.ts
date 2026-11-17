import type { SnapshotV2 } from './types'

/** 稳定序列化：对象键排序，数组可按调用方预排序，保证内容相同即输出相同。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

/**
 * 内容指纹：只编码 tasks / categories 记录本身，忽略 revision / exportedAt / deviceId /
 * lastSyncAt 等快照级元信息；主题、筛选、折叠、WebDAV 配置不参与。
 */
export function fingerprint(s: Pick<SnapshotV2, 'tasks' | 'categories'>): string {
  const tasks = [...s.tasks].sort((a, b) => a.uid.localeCompare(b.uid))
  const categories = [...s.categories].sort((a, b) => a.name.localeCompare(b.name))
  return stableStringify({ tasks, categories })
}
