import { BUILTIN_LAUNCH_IMAGES } from '@shared/launchImages'
const sources = import.meta.glob<string>('./assets/launch/*.{webp,jpg,jpeg,png,avif}', {
  eager: true, query: '?url', import: 'default'
})
export const builtInLaunchImages = BUILTIN_LAUNCH_IMAGES
  .map(image => ({ ...image, src: sources[`./assets/launch/${image.file}`] }))
  .filter(image => !!image.src)
