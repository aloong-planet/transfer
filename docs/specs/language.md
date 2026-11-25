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
- language::REQ-003/AC-02: Every frame of the main window, the first included, is drawn in the language in force; no frame in the other language is shown before it.
- language::REQ-003/AC-03: Each window that shows interface text declares the language in force to assistive technology, as `zh-Hans` for Chinese and `en` for English, from the first frame that shows that text, and follows a change of language without being reopened. The main window's start-up placeholder before that frame, which shows only the product name, declares `zh-Hans`.
- language::REQ-003/AC-04: The macOS prompt that asks whether Transfer may use the local network follows the system's list of preferred languages, not the language preference (language::REQ-001): it is in the interface's Chinese when the first language in that list that is Chinese or English is Chinese, and in English otherwise, including when the list holds neither. For this prompt a Chinese language is one beginning with zh, in Simplified or Traditional script or with no script given, whatever its region, and any other tag macOS matches to Chinese; language::REQ-002/AC-01 counts every zh language, and this statement does not. The matching is macOS's own, measured on macOS 26.0.1.

## Out of Scope

A language other than Chinese and English.
