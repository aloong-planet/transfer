// Flashes the Windows taskbar for a new incoming message (unread::REQ-003/AC-02).

export interface TaskbarFlasherDeps {
  /** process.platform */
  platform: string
  /** Whether the main window has focus right now */
  windowFocused: () => boolean
  /** Flash the main window's taskbar button; the focus handler stops it */
  flashTaskbar: () => void
}

export class TaskbarFlasher {
  private readonly d: TaskbarFlasherDeps
  private previousTotal = 0

  constructor(deps: TaskbarFlasherDeps) {
    this.d = deps
  }

  /**
   * The renderer's total unread count, reported on every change of it. The flash follows the
   * count: the total rises only when the renderer counts a message (`shouldCountUnread`), so a
   * state change of a message already shown, or a message sent from here, cannot flash. The
   * message callback this process gets does not say whether a message is new; the renderer
   * decides that, once, for the count, and the flash reuses its answer.
   */
  onUnreadTotal(total: number): void {
    const rose = total > this.previousTotal
    this.previousTotal = total
    if (rose && this.d.platform === 'win32' && !this.d.windowFocused()) this.d.flashTaskbar()
  }
}
