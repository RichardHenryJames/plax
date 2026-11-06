import { imageUri, IMAGE_HOST_E2E } from '../images'
import { setVariant } from '../../test/helpers'

describe('the address a picture is loaded from', () => {
  it('is the address the story gives, in the real builds', () => {
    for (const name of ['play', 'preview'] as const) {
      setVariant(name)
      expect(imageUri('https://img.example.com/a.jpg')).toBe('https://img.example.com/a.jpg')
      expect(imageUri(`${IMAGE_HOST_E2E}/landscape-1.png`)).toBe(`${IMAGE_HOST_E2E}/landscape-1.png`)
    }
  })

  it('is the mock website\'s for the stories of the test build, which cannot reach an https host of its own', () => {
    setVariant('e2e')
    expect(imageUri(`${IMAGE_HOST_E2E}/landscape-1.png`)).toBe('http://10.0.2.2:8787/news/e2e-img/landscape-1.png')
    expect(imageUri('https://img.example.com/a.jpg')).toBe('https://img.example.com/a.jpg')
  })
})
