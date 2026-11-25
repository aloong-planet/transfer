# Image context menu (copy image)

## Question

Target feature: copy a chat image, sent or received, to the clipboard from its right-click menu, so it can be pasted into another app.

1. The menu with the new item: Copy Image, Save Image, Open with System App, copy first.
2. The thumbnail's tooltip now names copying: "Click to view · Right-click to copy or save".
3. A phone photo whose file carries an EXIF rotation shows upright in its thumbnail, where it used to show sideways, and is copied upright; both match the full-size view.
4. The menu stays inside the window: near the right or bottom edge it opens to the left of or above the pointer instead of being cut off.

The menu opens on load over the received photo, as if it had been right-clicked. Right-click either image to move it, and right-click near the window's right or bottom edge to see question 4.

## Structure basis

The user confirmed the position, wording and scope of the new item; the menu otherwise keeps the app's existing structure. Copying gives no feedback: the menu closes and nothing else happens.

Drawn from the app for the first time, because no prototype had them: the image right-click menu (the geometry and colours of the app's chat view) and the thumbnail sizing (at most 180×240, radius 8). Taken from the transfer-speed prototype: the bubble geometry (max-width 74%, padding 8px 12px, radius 14 with the 5px tail corner) and the bubble meta line.

## Demo scaffolding

None; the page has no harness. It follows the gallery's language and mode settings.
