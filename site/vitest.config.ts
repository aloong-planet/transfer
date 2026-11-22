/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config'

// The site's tests run on the site's own Astro config, so they can render .astro pages through
// Astro's Container API (Astro's testing guide: getViteConfig + experimental_AstroContainer).
// The repository root's vitest has no Astro compiler and does not run anything under site/.
export default getViteConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
