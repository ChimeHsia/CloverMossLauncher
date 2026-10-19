export function cloverUrl(file: string): string {
  return `clover://local?path=${encodeURIComponent(file)}`
}
