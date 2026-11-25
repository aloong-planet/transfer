import { describe, it, expect } from 'vitest'
import { addUnread, shouldCountUnread, totalUnread, type UnreadContext } from './unread'

// 默认:收到的新消息、窗口未聚焦、在看别的会话 → 应计未读
function ctx(over: Partial<UnreadContext> = {}): UnreadContext {
  return {
    direction: 'recv',
    isNew: true,
    windowFocused: false,
    view: 'chat',
    currentPeer: 'peerB',
    msgPeer: 'peerA',
    ...over
  }
}

describe('shouldCountUnread', () => {
  it('收到的新消息 + 窗口后台 → 计未读', () => {
    expect(shouldCountUnread(ctx({ windowFocused: false }))).toBe(true)
  })

  it('自己发的(sent)→ 不计', () => {
    expect(shouldCountUnread(ctx({ direction: 'sent' }))).toBe(false)
  })

  it('非新消息(状态更新)→ 不计', () => {
    expect(shouldCountUnread(ctx({ isNew: false }))).toBe(false)
  })

  // 门控核心:聚焦 + chat 视图 + 正看的就是该 peer → 不计
  it('聚焦且正在看该会话 → 不计(已读)', () => {
    expect(
      shouldCountUnread(ctx({ windowFocused: true, view: 'chat', currentPeer: 'peerA', msgPeer: 'peerA' }))
    ).toBe(false)
  })

  it('聚焦但在看别的会话 → 计未读', () => {
    expect(
      shouldCountUnread(ctx({ windowFocused: true, view: 'chat', currentPeer: 'peerB', msgPeer: 'peerA' }))
    ).toBe(true)
  })

  it('聚焦但在 downloads 视图 → 计未读(没在看会话)', () => {
    expect(
      shouldCountUnread(ctx({ windowFocused: true, view: 'downloads', currentPeer: 'peerA', msgPeer: 'peerA' }))
    ).toBe(true)
  })

  it('未聚焦即使选中的是该 peer → 计未读(窗口在后台没在看)', () => {
    expect(
      shouldCountUnread(ctx({ windowFocused: false, view: 'chat', currentPeer: 'peerA', msgPeer: 'peerA' }))
    ).toBe(true)
  })

  it('currentPeer 为 null(未选会话)→ 计未读', () => {
    expect(
      shouldCountUnread(ctx({ windowFocused: true, view: 'chat', currentPeer: null, msgPeer: 'peerA' }))
    ).toBe(true)
  })
})

// Builds and reads unread counts the way the app holds them.
const counts = (entries: [string, number][]): Map<string, number> => new Map(entries)
const countOf = (c: ReadonlyMap<string, number>, peer: string): number | undefined => c.get(peer)

// Fingerprints the cases below run for.
const PEERS = ['constructor', '__proto__', 'toString', 'AB:CD:EF:01:23']

describe('addUnread', () => {
  // unread::REQ-001/AC-01, unread::REQ-002/AC-01
  it.each(PEERS)('two messages from %s count as 2 and leave other peers alone', (peer) => {
    const next = addUnread(addUnread(counts([['peerB', 2]]), peer), peer)
    expect(countOf(next, peer)).toBe(2)
    expect(countOf(next, 'peerB')).toBe(2)
  })
})

describe('totalUnread', () => {
  // unread::REQ-003/AC-01
  it.each(PEERS)('adds the count of %s to the other peers', (peer) => {
    const c = addUnread(addUnread(counts([['peerB', 3]]), peer), peer)
    expect(totalUnread(c)).toBe(5)
  })
})
