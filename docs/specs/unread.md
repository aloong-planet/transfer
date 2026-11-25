# Unread message alerts

> Related: [transfer-chat](transfer-chat.md) (the messages that are counted) · [device-alias](device-alias.md) (the device row the in-app count sits on)

## Problem Statement
When the window is not in front, an incoming message goes unnoticed and is easily missed.

## Solution
Alerts come in two layers. On the desktop, the app icon shows a count (macOS) or flashes (Windows); in the app, the device row of each conversation shows how many of its messages are unread.

## Functional Requirements

### unread::REQ-001 What counts as unread

- unread::REQ-001/AC-01: An incoming message, text or file, counts as one unread message from its sender, unless the window has focus and the sender's chat is open at the moment the message first appears.
- unread::REQ-001/AC-02: A message sent from this device does not count, and neither does a change in the state of a message already shown, such as a transfer finishing.

### unread::REQ-002 The count in the app

- unread::REQ-002/AC-01: A device's row shows a badge at its right end with the number of unread messages from that device, and 99+ when there are more than 99. A device with none shows no badge.
- unread::REQ-002/AC-02: A conversation's count goes to zero when its chat is open while the window has focus: when the chat is opened in a focused window, or when a window already showing it gains focus.

### unread::REQ-003 The alert on the desktop

- unread::REQ-003/AC-01: On macOS the Dock icon shows a badge with the total number of unread messages of all conversations, and no badge when the total is zero.
- unread::REQ-003/AC-02: On Windows the taskbar icon flashes when an incoming message that counts as unread (unread::REQ-001/AC-01) arrives while the window has no focus, and stops when the window gains focus. A change in the state of a message already shown does not flash it.

## Out of Scope

A sound, and a system notification banner.
