import { test, expect, describe } from 'vitest'
import {
  isTextMessage,
  extractText,
  encodeTextMessage,
  isTextTooLarge,
  MAX_RECV_PREVIEW_BYTES
} from './text-message'
import type { FileMeta } from '@shared/types'

function fm(partial: Partial<FileMeta>): Record<string, FileMeta> {
  const meta: FileMeta = {
    id: 'x',
    fileName: 'x.txt',
    size: 1,
    fileType: 'text',
    ...partial
  }
  return { [meta.id]: meta }
}

describe('isTextMessage', () => {
  test('单个 fileType=text → 是', () => {
    expect(isTextMessage(fm({ fileType: 'text' }))).toBe(true)
    expect(isTextMessage(fm({ fileType: 'text/plain' }))).toBe(true)
  })
  test('非 text 类型 → 否', () => {
    expect(isTextMessage(fm({ fileType: 'image/png' }))).toBe(false)
    expect(isTextMessage(fm({ fileType: 'application/octet-stream' }))).toBe(false)
  })
  test('多文件 → 否(即便都是 text)', () => {
    const files = {
      a: { id: 'a', fileName: 'a.txt', size: 1, fileType: 'text' as const },
      b: { id: 'b', fileName: 'b.txt', size: 1, fileType: 'text' as const }
    }
    expect(isTextMessage(files)).toBe(false)
  })
  test('空 → 否', () => {
    expect(isTextMessage({})).toBe(false)
  })
})

describe('extractText', () => {
  test('取 preview 正文', () => {
    expect(extractText(fm({ preview: '你好世界' }))).toBe('你好世界')
  })
  test('非文本消息 → null', () => {
    expect(extractText(fm({ fileType: 'image/png', preview: 'x' }))).toBeNull()
  })
  test('无 preview → null', () => {
    expect(extractText(fm({ preview: undefined }))).toBeNull()
  })
  test('超大 preview 截断到上限', () => {
    const huge = 'a'.repeat(MAX_RECV_PREVIEW_BYTES + 1000)
    const got = extractText(fm({ preview: huge }))!
    expect(Buffer.byteLength(got, 'utf8')).toBeLessThanOrEqual(MAX_RECV_PREVIEW_BYTES)
  })
  test('a body of exactly 64 KiB is not cut', () => {
    const exact = 'a'.repeat(65536)
    expect(extractText(fm({ preview: exact }))).toBe(exact)
  })
  test('a cut that splits a multibyte character leaves one U+FFFD in its place', () => {
    // 30000 × '€' is 90000 bytes (3 each); 65536 = 21845 × 3 + 1, so the cut falls
    // one byte into the 21846th '€'.
    const got = extractText(fm({ preview: '€'.repeat(30000) }))
    expect(got).toBe('€'.repeat(21845) + '�')
  })
})

describe('encodeTextMessage', () => {
  test('编码成 fileType=text + preview 承载正文', () => {
    const { fileId, meta } = encodeTextMessage('hello')
    expect(meta.fileType).toBe('text')
    expect(meta.preview).toBe('hello')
    expect(meta.id).toBe(fileId)
    expect(meta.fileName).toBe(`${fileId}.txt`)
    expect(meta.size).toBe(5) // utf8 字节
  })
  test('中文 size 为 utf8 字节数', () => {
    const { meta } = encodeTextMessage('你好') // 每字 3 字节
    expect(meta.size).toBe(6)
  })
  test('往返:encode 后能被 isTextMessage/extractText 识别', () => {
    const { fileId, meta } = encodeTextMessage('round trip 测试')
    const files = { [fileId]: meta }
    expect(isTextMessage(files)).toBe(true)
    expect(extractText(files)).toBe('round trip 测试')
  })
})

describe('isTextTooLarge', () => {
  // The limit is counted in UTF-8 bytes, not characters: 16385 × 'é' is only 16385
  // characters but 32770 bytes.
  test.each([
    { name: 'short text', text: 'short', expected: false },
    { name: 'exactly 32768 bytes', text: 'a'.repeat(32768), expected: false },
    { name: '32769 bytes', text: 'a'.repeat(32769), expected: true },
    { name: '16385 characters = 32770 bytes', text: 'é'.repeat(16385), expected: true }
  ])('$name → over the limit: $expected', ({ text, expected }) => {
    expect(isTextTooLarge(text)).toBe(expected)
  })
})
