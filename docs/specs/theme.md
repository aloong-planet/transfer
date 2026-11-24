# Theme

## Problem Statement
Users work in light and in dark surroundings, and the interface has to fit both.

## Solution
The main window follows the system's appearance, or the user fixes it to light or dark.

## Functional Requirements

### theme::REQ-001 The theme preference

- theme::REQ-001/AC-01: The preference has three values: follow the system (the default), light and dark. Following the system gives the main window the system's light or dark appearance.
- theme::REQ-001/AC-02: A button in the header of the device list shows the current value as 跟随系统 / 浅色 / 深色 (Follow System / Light / Dark), with the tooltip 主题:{label}(点击切换) / Theme: {label} (click to switch). Each click moves to the next value in the order follow the system, light, dark, and back to following the system.
- theme::REQ-001/AC-03: A change applies to the main window at once, without Save, and is saved.
- theme::REQ-001/AC-04: The value is stored in `settings.json` as `theme`, one of `system`, `light` and `dark`; a missing or unrecognised value counts as `system`.

## Out of Scope

The screenshot capture window: it has fixed colours and does not follow the preference.
