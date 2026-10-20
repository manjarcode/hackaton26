import { describe, expect, it } from 'vitest'

describe('smoke', () => {
  it('siempre pasa', () => {
    expect(true).toBe(true)
  })

  it('la suma sigue funcionando', () => {
    expect(1 + 1).toBe(2)
  })
})
