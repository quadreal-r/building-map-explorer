import { afterEach, describe, expect, it } from 'vitest'
import { isValidStoredPortfolio, loadPortfolioData } from '@/hooks/usePortfolioData'

const samplePortfolio = {
  buildings: [
    {
      address: '1 Main St',
      lat: 43.6,
      lng: -79.4,
      park: 'P',
      bu: '1',
      sqft: '1',
      cluster: 'C',
      manager: 'M',
    },
  ],
  utilities: [],
  polygons: [],
}

describe('isValidStoredPortfolio', () => {
  it('accepts a well-formed portfolio', () => {
    expect(isValidStoredPortfolio(samplePortfolio)).toBe(true)
  })

  it('rejects missing buildings', () => {
    expect(isValidStoredPortfolio({ utilities: [], polygons: [] })).toBe(false)
  })

  it('rejects empty buildings', () => {
    expect(isValidStoredPortfolio({ buildings: [], utilities: [], polygons: [] })).toBe(false)
  })

  it('rejects buildings without coordinates', () => {
    expect(
      isValidStoredPortfolio({
        buildings: [{ address: '1 Main St' }],
        utilities: [],
        polygons: [],
      }),
    ).toBe(false)
  })
})

describe('loadPortfolioData', () => {
  afterEach(() => {
    localStorage.clear()
    delete window.__BME_EMBEDDED_PORTFOLIO__
  })

  it('prefers embedded portfolio from saved HTML', async () => {
    window.__BME_EMBEDDED_PORTFOLIO__ = samplePortfolio
    await expect(loadPortfolioData()).resolves.toEqual(samplePortfolio)
  })
})
