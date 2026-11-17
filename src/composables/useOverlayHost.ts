/** 所有 Teleport / Reka Portal 统一挂到 body 直属层，祖先不得带 transform / filter。 */
export function useOverlayHost() {
  return { target: '#overlay-host' }
}
