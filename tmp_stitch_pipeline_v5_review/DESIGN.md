# Design System Documentation: Technical Editorial Excellence

## 1. Overview & Creative North Star: "The Living Manuscript"

The Creative North Star for this design system is **"The Living Manuscript."** 

Unlike traditional technical documentation that feels like a static spreadsheet, this system treats information as a high-end editorial experience. We are moving away from the "industrial" look of typical dev-docs. Instead, we embrace a layout that feels curated, breathable, and premium. 

By leveraging **intentional asymmetry**, we break the monotony of the standard grid. Technical diagrams and flow-lines aren't just utilities; they are aesthetic anchors. We use extreme typographic scaling to create an authoritative hierarchy, ensuring that even the most dense technical data feels approachable and sophisticated.

---

## 2. Colors & Surface Architecture

The palette is rooted in a "Midnight" foundation, balanced by "Mint" and "Lavender" highlights to provide a sense of freshness and modern clarity.

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are strictly prohibited for sectioning content. Boundaries must be defined solely through background color shifts. Use `surface-container-low` sections sitting on a `surface` background to create structure.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the surface tiers to define importance:
*   **Base Layer:** `surface` (#f9f9f8) - The canvas.
*   **Secondary Sectioning:** `surface-container-low` (#f3f4f3) - For large lateral panels or background grouping.
*   **Primary Interactive Surface:** `surface-container-lowest` (#ffffff) - Reserved for cards, code blocks, and primary content areas.
*   **Active Overlays:** `surface-bright` (#f9f9f8) with Glassmorphism (see below).

### The "Glass & Gradient" Rule
To elevate the "Midnight" primary actions, avoid flat fills. Use a subtle linear gradient from `primary` (#091426) to `primary-container` (#1e293b) at a 135-degree angle. For floating navigation or details panels, apply a `backdrop-blur` (8px to 16px) with a semi-transparent `surface-container-lowest` at 80% opacity.

---

## 3. Typography: Editorial Authority

We pair the geometric precision of **Space Grotesk** with the humanist readability of **Plus Jakarta Sans**.

*   **Display & Headlines (Space Grotesk):** Use `display-lg` (3.5rem) for main documentation titles. The tight tracking and monolinear stroke of Space Grotesk provide a "Brutalist-Lite" feel that signals technical precision.
*   **Body & Titles (Plus Jakarta Sans):** Use `body-lg` (1rem) for documentation prose. This font provides high legibility for long-form technical reading.
*   **Labels & Metadata:** Use `label-md` (0.75rem) in uppercase with +5% letter spacing for technical tags or "Mint" themed chips.

---

## 4. Elevation & Depth: Tonal Layering

We reject traditional structural lines in favor of **Tonal Layering**.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` section. This creates a soft, natural lift (the "Paper-on-Stone" effect) without heavy shadows.
*   **Ambient Shadows:** For floating elements (Modals, Hovered Cards), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(30, 41, 59, 0.06)`. Note the use of the `primary` color (Midnight) at 6% opacity rather than pure black.
*   **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use the `outline-variant` (#c5c6cd) at **15% opacity**. This creates a "suggestion" of a border that doesn't interrupt the editorial flow.

---

## 5. Components

### Cards & Sequential Panels
*   **Corner Radius:** Always `xl` (1.5rem / 24px) or `lg` (1rem / 16px).
*   **Interaction:** No divider lines. Use vertical white space (`spacing-8` to `spacing-12`) to separate content sections.
*   **Flow Lines:** Connect sequential cards using a 2px path in `secondary-fixed-dim` (Mint). These lines should feel organic, using `border-radius: full` for turns.

### Buttons & Actions
*   **Primary:** Midnight gradient (`primary` to `primary-container`). Text in `on-primary`. 
*   **Secondary (Mint):** `secondary-container` background with `on-secondary-container` text. This is used for "Success" or "Complete" states in technical flows.
*   **Tertiary (Lavender):** `tertiary-container` for auxiliary technical details or "Secondary Documentation."

### Chips (Insignias)
*   **Style:** Pill-shaped (`rounded-full`). 
*   **Coloring:** Use `secondary-container` (Mint) for status "Active" and `tertiary-fixed` (Lavender) for status "Draft" or "Beta."

### Details Panels (Lateral)
*   These should emerge from the right using `surface-container-low`. They do not have shadows; they rely on the color shift against the `surface-container-lowest` main content.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical margins. If the main content is centered, allow code snippets to bleed into the right margin for a "pro-editor" feel.
*   **Do** use `secondary` (Mint) sparingly as a "highlighter" for key technical terms within body text.
*   **Do** leverage the `spacing-20` (7rem) value for hero section headers to provide massive breathing room.

### Don't
*   **Don't** use 100% black text. Always use `on-surface` (#1a1c1c) to maintain the soft-premium aesthetic.
*   **Don't** use "Drop Shadows" on every card. Only use them for elements that are physically "above" the content (Tooltips, Popovers).
*   **Don't** use dividers. If you feel the need for a line, increase the `spacing` scale by one tier instead.

---

## 7. Token Reference Summary

| Token Name | Value | Usage |
| :--- | :--- | :--- |
| `primary` | #1E293B (Midnight) | Primary CTA, Headers |
| `secondary` | #A7F3D0 (Mint) | Success states, Highlights |
| `tertiary` | #E9D5FF (Lavender) | Auxiliary Info, Beta Tags |
| `surface` | #FAFAF9 (Light Stone) | Main Background |
| `surface-lowest` | #FFFFFF (White) | Content Cards |
| `radius-lg` | 16px | Standard Cards |
| `radius-xl` | 24px | Layout Containers |