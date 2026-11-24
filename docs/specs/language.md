# Interface language

## Problem Statement
Users read Chinese or English, and the interface has to be in the language they read.

## Solution
The interface follows the system's language, or the user fixes it to Chinese or English, and the choice applies at once.

## Functional Requirements

### language::REQ-001 The language preference

- language::REQ-001/AC-01: The preference has three values: follow the system (the default), Chinese and English. Settings has a selector offering them as 跟随系统 / 中文 / English in the Chinese interface and Follow System / 中文 / English in the English one.
- language::REQ-001/AC-02: A change applies at once, without a restart and without Save, and is saved.
- language::REQ-001/AC-03: The value is stored in `settings.json` as `language`, one of `system`, `zh` and `en`; a missing or unrecognised value counts as `system`.

### language::REQ-002 Following the system

- language::REQ-002/AC-01: Following the system uses the first language in the system's list of preferred languages, read when the app starts or the preference is set: one beginning with zh, whatever its script or region, gives Chinese, and any other language, or an empty list, gives English.
- language::REQ-002/AC-02: While the preference is follow the system, Settings shows 改系统语言后需重启应用生效 / Changing the system language takes effect after restarting the app.

### language::REQ-003 What the language covers

- language::REQ-003/AC-01: The language applies to the main window, to the toolbar and hints of the screenshot capture ([screenshot::REQ-003](screenshot.md), [screenshot::REQ-004](screenshot.md)), and to the dialogs the main process opens, such as the receive-folder dialog and the screen-recording guidance dialog ([screenshot::REQ-005/AC-03](screenshot.md)).

## Out of Scope

A language other than Chinese and English.
