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
  /** Optional user-supplied asset; generated defaults are required and distributed. */
  optional?: boolean
  generated?: boolean
}

/** Default AI-generated backgrounds and their public provenance records. */
export const BUILTIN_LAUNCH_IMAGES: readonly LaunchImage[] = landscapes

export function isBuiltinLaunchImage(key: string): boolean {
  return BUILTIN_LAUNCH_IMAGES.some(image => image.key === key)
}
