# Screenshot and annotation

> Related: ADR-0008 (the feature's scope) · ADR-0009 (the selection window is kept and reused) · [language](language.md) (the toolbar and the overlay's texts follow the interface language) · [transfer-chat](transfer-chat.md) (the message the Send exit adds)

## Problem Statement
In a chat one often needs to point at the screen and talk, and the route of taking a screenshot, saving it, finding the file and dragging it in is too roundabout.

## Solution
A global shortcut starts a capture: the user selects a region of the screen, annotates it, and sends it to the person in the current chat, copies it to the clipboard or saves it as a file.

## Functional Requirements

### screenshot::REQ-001 Starting a capture with a global shortcut

- screenshot::REQ-001/AC-01: The capture starts from a system-wide shortcut, F1 until the user chooses another, so it starts while another application is in front.
- screenshot::REQ-001/AC-02: Settings has a 快捷键 / Shortcut section with a 截图 / Screenshot button showing the current combination. Choosing it, then pressing a combination, sets that combination as the shortcut at once, with no Save; Esc, or the button losing focus, ends the choosing without a change.
- screenshot::REQ-001/AC-03: A combination is accepted when it is F1 to F24, with or without modifiers, or any other supported key together with at least one of Command, Control, Alt and Shift. The supported keys are A to Z, 0 to 9, the four arrow keys, Space, Enter, Tab, Backspace, Delete, Home, End, PageUp, PageDown, Insert and the keys for ` - = [ ] \ ; ' , . /. A plain key is refused with 普通键需配合 Cmd/Ctrl/Alt/Shift / Regular keys need Cmd/Ctrl/Alt/Shift, and an unsupported key with 不支持该按键,请换一个 / This key is not supported, try another.
- screenshot::REQ-001/AC-04: When the system refuses the new combination because another application holds it, the previous shortcut stays in force and is kept, and Settings says 该快捷键可能被其他程序占用,请换一个 / This shortcut may be taken by another app, try another.

### screenshot::REQ-002 Selecting a region with a magnifier

- screenshot::REQ-002/AC-01: Starting a capture captures the display the pointer is on and opens the selection over it. The other displays are covered by dimming windows that take no clicks, and a selection cannot leave the captured display. Dragging selects a rectangle, and a selection smaller than 4×4 logical pixels is discarded.
- screenshot::REQ-002/AC-02: While there is no valid selection, a magnifier follows the pointer, showing the pixels around it enlarged and the colour value under the pointer.

### screenshot::REQ-003 Annotation tools

- screenshot::REQ-003/AC-01: The toolbar offers these tools, in this order: 矩形 / Rectangle, 椭圆 / Ellipse, 箭头 / Arrow, 直线 / Line, 画笔 / Pen, 马赛克 / Mosaic, 模糊 / Blur, 文字 / Text, 序号 / Number. No tool is selected when the toolbar opens.
- screenshot::REQ-003/AC-02: The colour is one of #e23b3b (the default), #f59e0b, #22c55e, #2d84c4, #7c3aed, #111111 and #ffffff, and applies to every tool except Mosaic and Blur. The thickness is a whole number from 1 to 6, 2 by default, set with the 粗细 / Stroke Width slider.
- screenshot::REQ-003/AC-03: The colour and thickness chosen apply to the next element drawn, and a new capture starts again from the defaults.

### screenshot::REQ-004 Exits

- screenshot::REQ-004/AC-01: 复制到剪贴板 / Copy to Clipboard puts the image on the system clipboard and closes the capture; nothing is written to disk.
- screenshot::REQ-004/AC-02: 保存为文件 / Save as File opens a save dialog with the PNG 图片 / PNG Image filter and the default name 截图_yyyyMMdd_HHmmss.png in Chinese, screenshot_yyyyMMdd_HHmmss.png in English (the local date and time of the save). The image is written to the path chosen, and the capture closes whether the dialog is confirmed or cancelled.
- screenshot::REQ-004/AC-03: 发到当前聊天 / Send to current chat closes the capture and sends the image, as a PNG file, to the person whose chat is open in the main window; it adds a message to that chat like any file sent there (transfer-chat). When no chat is open, the button is disabled with the tooltip 先在主窗选择一个聊天对象 / Pick a chat target in the main window first.
- screenshot::REQ-004/AC-04: Every exit gives the image as the PNG of the selection in physical pixels, with the annotations in it, and none of them shows a confirmation.

### screenshot::REQ-005 Screen-recording permission on macOS

- screenshot::REQ-005/AC-01: On macOS, whenever the app starts without the screen-recording permission, the app attempts a capture once the main window has been shown, so that the system shows its permission prompt. The attempt is never made from the shortcut, so the app's own guidance and the system's prompt are not on screen together.
- screenshot::REQ-005/AC-02: After the user allows the permission, captures work only once the app has been restarted: the system keeps reporting the old state to a running process ([postmortem](../postmortems/screen-permission-preflight-deadlock.md)).
- screenshot::REQ-005/AC-03: On macOS, starting a capture, with the shortcut or the chat's screenshot button, while the permission is not granted opens no selection and shows the dialog 需要屏幕录制权限 / Screen Recording Permission Required. Its text is 请在「系统设置 → 隐私与安全性 → 屏幕录制」中允许 Transfer,然后重启应用。 / Please allow Transfer under System Settings → Privacy & Security → Screen Recording, then restart the app. Its 打开系统设置 / Open System Settings button opens the Screen Recording pane of System Settings, and 取消 / Cancel closes the dialog.
- screenshot::REQ-005/AC-04: On any other platform there is no permission step.

## Failure modes and boundaries

| Boundary | Expected behaviour |
|---|---|
| The saved shortcut cannot be registered at startup | The shortcut does not work and nothing tells the user; the reason is written to the log only. screenshot::REQ-001/AC-04 applies only to a change made in Settings |

## Out of Scope

Pinning an image to the screen, OCR, a scrolling or long screenshot, screen recording or GIF, a delayed capture, and a highlighter or marker pen (ADR-0008).
