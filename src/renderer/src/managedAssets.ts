/** Build an opaque URL for a local image that the main process has explicitly authorized. */
export function managedImageUrl(filePath: string, thumbnailWidth = 0): string {
  if (!filePath) return ''
  const url = new URL('kamucl-asset://local/image')
  url.searchParams.set('path', filePath)
  if(thumbnailWidth)url.searchParams.set('width',String(thumbnailWidth))
  return url.toString()
}
