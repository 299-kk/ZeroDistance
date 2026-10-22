import landscapes from './landscape-images.json'

export interface LaunchImage {
  key: string
  title: string
  file: string
  author?: string
  source?: string
  sourceUrl?: string
  license?: string
  sha256?: string
  position?: string
  /** Optional local photograph; omitted from public source until redistribution is verified. */
  optional?: boolean
}

/** Source records are public; local photograph files are optional and separately licensed. */
export const BUILTIN_LAUNCH_IMAGES: readonly LaunchImage[] = landscapes

export function isBuiltinLaunchImage(key: string): boolean {
  return BUILTIN_LAUNCH_IMAGES.some(image => image.key === key)
}
