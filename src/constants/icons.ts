/** 原型图标路径 1:1 迁移，保持 24x24 viewBox 与 currentColor 语义。 */
export const ICONS: Record<string, string> = {
  today:'<path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6"/>',
  stats:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  calendar:'<rect x="3" y="4" width="18" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" stroke-width="1.6"/>',
  settings:'<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="1.6"/>',
  plus:'<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  check:'<path d="M5 12l5 5L20 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  pencil:'<path d="M4 20l4-1 11-11-3-3L5 16z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  flag:'<path d="M6 21V4h11l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  folder:'<path d="M3 7h6l2 2h10v10H3z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  sub:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" stroke-width="1.6"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  cloud:'<path d="M7 18a4 4 0 010-8 5 5 0 019-2 4 4 0 011 10H7z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  // 已与远程同步：云中间带对钩；有本地更改待同步：云中间改为上传箭头
  cloudOk:'<path d="M7 18a4 4 0 010-8 5 5 0 019-2 4 4 0 011 10H7z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.4 13.2l2.2 2.2 4.3-4.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  cloudDirty:'<path d="M7 18a4 4 0 010-8 5 5 0 019-2 4 4 0 011 10H7z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12.4 15.9V10.5M10.1 12.8l2.3-2.3 2.3 2.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  sync:'<path d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 5v4h-4M6 19v-4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  close:'<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  chevron:'<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
};

export type IconName = keyof typeof ICONS
