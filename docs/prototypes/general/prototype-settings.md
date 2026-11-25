# Settings dialog (receive folder)

## Question

The settings dialog with a new Receive folder element in the Storage section: the path row, the "Change…" and "Reset to Default" links, a notice for a folder that has become unusable, and a one-time note after the folder is changed. Does the element fit the dialog's minimal row layout in each of its four states: default, chosen by the user, just changed, and unusable with the notice waiting to be dismissed?

The simplified main-window shell behind the dialog is context only; the mask dims and blurs it.

## Structure basis

Everything except the Receive folder element is drawn from the settings dialog as the app has it: a minimal row layout, labels with a colon at content width, dropdowns rather than segmented controls, and the icon button at the far right of the storage row.

## Demo scaffolding

Not part of the design; do not implement.

- A bar at the top left switches the four Receive folder states. In the app the state follows the stored folder and whether it is available; there is no such control.
