// The header's link back to the aloong planet homepage: landing-page::REQ-001/AC-01.
//
// Gap: landing-page::REQ-001/AC-02 and landing-page::REQ-001/AC-03 (sizes, colours, gaps, hover and
// the narrow-window layout) are not tested here. They are computed styles and geometry, which only
// a browser can read, and the site has no browser test runner.
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { Window } from 'happy-dom'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import EnLanding from './pages/en/index.astro'
import EnPrivacy from './pages/en/privacy.astro'
import ZhLanding from './pages/index.astro'
import ZhPrivacy from './pages/privacy.astro'

let container: AstroContainer
const window = new Window()

beforeAll(async () => {
  container = await AstroContainer.create()
})

afterAll(async () => {
  await window.happyDOM.close()
})

async function renderHeader(page: Parameters<AstroContainer['renderToString']>[0]) {
  const html = await container.renderToString(page)
  const doc = new window.DOMParser().parseFromString(html, 'text/html')
  const headers = doc.querySelectorAll('header')
  expect(headers.length, 'one site header').toBe(1)
  return headers[0]
}

describe('site header', () => {
  test.each([
    { page: 'Chinese landing page', component: ZhLanding, ownHome: '/' },
    { page: 'Chinese privacy page', component: ZhPrivacy, ownHome: '/' },
    { page: 'English landing page', component: EnLanding, ownHome: '/en' },
    { page: 'English privacy page', component: EnPrivacy, ownHome: '/en' },
  ])(
    'the $page starts with the aloong planet link, a separator hidden from assistive technology, then the brand',
    async ({ component, ownHome }) => {
      const header = await renderHeader(component)
      const [homepage, brand] = header.querySelectorAll('a')

      expect(homepage.textContent?.trim()).toBe('aloong planet')
      expect(homepage.getAttribute('href')).toBe('https://aloongplanet.com/')
      // Opens in the current tab, unlike the header's GitHub link.
      expect(homepage.hasAttribute('target')).toBe(false)

      expect(brand.textContent?.trim()).toBe('Transfer')
      expect(brand.querySelector('img')).not.toBeNull()
      expect(brand.getAttribute('href')).toBe(ownHome)

      const separators = [...header.querySelectorAll('*')].filter(
        (el) => el.children.length === 0 && el.textContent?.trim() === '/',
      )
      expect(separators).toHaveLength(1)
      const [separator] = separators
      expect(separator.closest('a')).toBeNull()
      expect(separator.closest('[aria-hidden="true"]')).not.toBeNull()
      // In reading order, and neither inside the other.
      expect(homepage.compareDocumentPosition(separator)).toBe(window.Node.DOCUMENT_POSITION_FOLLOWING)
      expect(separator.compareDocumentPosition(brand)).toBe(window.Node.DOCUMENT_POSITION_FOLLOWING)
    },
  )
})
