export type BootstrapSource = 'cloud' | 'local' | 'empty'

/** Cloud is authoritative after first successful write; local can seed only an empty cloud workspace. */
export function chooseBootstrapSource(cloudWeight: number, localWeight: number): BootstrapSource {
  if (cloudWeight > 0) return 'cloud'
  if (localWeight > 0) return 'local'
  return 'empty'
}
