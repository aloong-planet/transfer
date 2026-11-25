# Interface language

## Problem Statement
Users read Chinese or English, and the interface has to be in the language they read. Their dates and times have to be written the way their region writes them, whichever language that is.

## Solution
The interface follows the system's language, or the user fixes it to Chinese or English, and the choice applies at once. Dates and times follow the system's region, not the language.

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

### language::REQ-004 Dates and times follow the system's region

Every date and time the app shows is written the way the system's region writes it (the 12- or 24-hour clock, the order of day and month, the separators), whatever language is in force and whatever the language preference (language::REQ-001) is.

- language::REQ-004/AC-01: The time under a chat message is written in the region's form: half past nine in the evening reads 21:30 with an English interface and a German region, and 09:30 PM with a Chinese interface and a US region.
- language::REQ-004/AC-02: A received file's line on the Received Files page ends with the month, day, hour and minute of its receipt, without the year, in the region's order and on the region's clock: 25/11, 21:30 with an English interface and a German region, and 11/25, 09:30 PM with a Chinese interface and a US region.
- language::REQ-004/AC-03: The region is the one the system reports for formatting dates and times, read when the main window is opened; every frame of that window, the first included, is written in it. That is the Region setting on macOS and the regional format on Windows (Electron's documentation; measured on macOS only). A change of the system's region shows once the window is opened again, after the app is restarted at the latest.
- language::REQ-004/AC-04: Where the platform has no format for the region in the language in force, such as a Chinese interface with a US region, the region's own form is written, as the region writes it in its most widely used language. A system that reports no region keeps the platform's default formatting.

## Out of Scope

A language other than Chinese and English.

Numbers: file sizes and speeds are written the same whatever the region. The date and time in a screenshot's default file name are written as [screenshot::REQ-004/AC-02](screenshot.md) says.
