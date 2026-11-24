# Device alias

> Related: ADR-0002 (a device is identified by the fingerprint of its certificate) · the glossary entries 备注(远端设备别名) and alias / defaultAlias / hasCustomAlias in [CONTEXT.md](../CONTEXT.md)

## Problem Statement
With several devices on one LAN, the name a device announces, usually its host name, is hard to tell apart, and a file or message is easily sent to the wrong one.

## Solution
The user gives any discovered device a name of their own. The app shows that name in place of the one the device announces, and keeps it for that device.

## Functional Requirements

### device-alias::REQ-001 Setting and clearing an alias

- device-alias::REQ-001/AC-01: Right-clicking a device's row in the device list opens a menu with 修改备注 / Edit Note, and, when the device has an alias, 清除备注 / Clear Note.
- device-alias::REQ-001/AC-02: Choosing 修改备注 turns the device's name in the row into an input. Enter, or clicking elsewhere, saves what is in the input as the alias; Esc leaves the input without a change.
- device-alias::REQ-001/AC-03: Choosing 清除备注 removes the alias, and the device shows the name it most recently announced again.

### device-alias::REQ-002 The alias is the name shown

- device-alias::REQ-002/AC-01: A device that has an alias shows it, and not the name the device announces, in the device list and in the title bar of that device's chat, the same in both.

### device-alias::REQ-003 The alias belongs to the device

- device-alias::REQ-003/AC-01: An alias is kept for the device's fingerprint, so it applies again when the device reappears after it went offline, was renamed or changed its address.
- device-alias::REQ-003/AC-02: Nothing removes an alias except the user clearing it: not the device going offline, and not the device being dropped from the device list once its offline retention time has passed ([discovery::REQ-002/AC-01](discovery.md)).
- device-alias::REQ-003/AC-03: Aliases are stored on this machine only, in `settings.json` under `deviceAliases`, a map from the device's fingerprint to its alias. No message sent to another device carries an alias.

### device-alias::REQ-004 A failed save

- device-alias::REQ-004/AC-01: When saving an alias fails, the input stays open with what was typed and gets a red border, and the row shows 保存失败,请重试 / Save failed, please retry in place of its second line. Enter, or clicking elsewhere, tries again.

## Out of Scope

- Syncing aliases between devices: an alias exists on this machine only.
- Removing an alias that is no longer used: aliases of devices that never come back stay in `settings.json`.
