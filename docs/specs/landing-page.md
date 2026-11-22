# Landing page

> Related: [landing-page-deploy](landing-page-deploy.md) (the same page built for two hosts)

## Problem Statement
A visitor on Transfer's website has no way to reach the author's homepage, where the author's other apps and tools are listed. Visitors also open the website on narrow phones, where a page wider than the screen has to be scrolled sideways.

## Solution
The header's left end reads "aloong planet / Transfer", and "aloong planet" opens the homepage. Every page fits the width of a phone's screen.

## Functional Requirements

### landing-page::REQ-001 Back to the aloong planet homepage

- landing-page::REQ-001/AC-01: On every page of the website (the landing page and the privacy page, in both languages), the header's left end shows, in order, "aloong planet", the separator "/" and the brand (icon and name). "aloong planet" is a link that opens `https://aloongplanet.com/` in the current tab; the "/" is not a link and assistive technology does not read it; the brand keeps its link to the page's own home. Both languages show "aloong planet", untranslated.
- landing-page::REQ-001/AC-02: "aloong planet" and "/" take the size and grey of the header's navigation links, with 10px between each of the three ("aloong planet", "/", the brand); in the narrow window of landing-page::REQ-001/AC-03, "aloong planet" and "/" are 4px apart. Hovering "aloong planet" turns it the navigation links' hover colour, without an underline.
- landing-page::REQ-001/AC-03: In a window 400px wide or narrower, "aloong planet /" shrinks to 11px, with a line height 1.3 times that size, on its own line 1px above the brand's line; the header keeps its height and the language switch stays at the right.

## Quality Requirements

### landing-page::QR-001 Narrow windows

Applies to: every page of the website (the landing page and the privacy page), in both languages.

- landing-page::QR-001/AC-01: In a window 320px wide or wider, the page does not scroll sideways: it is no wider than the window.
- landing-page::QR-001/AC-02: In a window 320px wide or wider, the text and icon of each of the landing page's feature cards show whole and inside their card, and no card overlaps another.

## Failure modes and boundaries
- The mainland copy ([landing-page-deploy](landing-page-deploy.md)) shows the same link to `https://aloongplanet.com/`.

## Out of Scope
- A homepage address of its own for the mainland copy: the mainland copy gets no special handling here.
- The homepage's Apps and Agents menus in the header: the header only links back to the homepage (landing-page::REQ-001).
