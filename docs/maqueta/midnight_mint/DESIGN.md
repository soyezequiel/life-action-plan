# Midnight Mint Design System

### 1. Overview & Creative North Star
**Creative North Star: "The Digital Sanctuary"**
Midnight Mint is a design system that prioritizes cognitive ease and structural clarity. It moves away from the aggressive "tech-heavy" aesthetic toward a high-end editorial experience that feels curated and intentional. The system utilizes a sophisticated mix of deep Slate tones and soft pastel accents (Lavender and Mint) to create a sense of calm reliability. 

The aesthetic is driven by **intentional asymmetry**—achieved through floating decorative blurs and carefully weighted typography—breaking the monotony of traditional SaaS grids to feel more like a bespoke financial boutique.

### 2. Colors
The palette is built on a foundation of neutral slates, punctuated by functional pastels.

*   **Primary (#1E293B):** The "Midnight" anchor. Used for high-impact elements, primary buttons, and headings to convey authority.
*   **Secondary/Tertiary (Lavender/Mint):** Used for iconography backgrounds and status indicators (e.g., "Connected"). These are never for text but for "zonal" identification.
*   **The "No-Line" Rule:** Sectioning is achieved through background shifts (e.g., `surface_container_low` vs `surface`). Traditional 1px borders are strictly limited to input fields and interactive elements; layout containers should use shadows or tonal shifts.
*   **Surface Hierarchy:**
    *   `surface`: The main card or modal body.
    *   `surface_container_low`: The page background (FAFAF9).
    *   `surface_container`: Nested utility areas (like the Service Mode selector).
*   **Glass & Gradient:** Use `lavender/20` and `mint/20` blurs in the corners of containers to provide a sense of atmospheric depth without adding structural noise.

### 3. Typography
The system employs a dual-typeface strategy to balance geometric precision with humanistic readability.

*   **Display & Headlines (Space Grotesk):** A high-character geometric sans used for brand expression and numerical data. 
    *   *Hero Scale:* 32px (font-bold) for primary balances.
    *   *Headline Scale:* 24px (font-semibold) for titles.
    *   *Label Scale:* 11px (uppercase, tracking-wider) for section headers.
*   **Body (Plus Jakarta Sans):** A modern, approachable sans-serif designed for legibility in inputs and descriptions.
    *   *Standard Body:* 15px/14px for primary interactions.
    *   *Small Body:* 13px for status text.
    *   *Micro/Support:* 12px italic for secondary context.

### 4. Elevation & Depth
Midnight Mint rejects harsh shadows in favor of "Atmospheric Diffusion."

*   **The Layering Principle:** Use `surface_container_low` for the base canvas and `surface` (Pure White) for the active interaction card.
*   **Ambient Shadows:** The system uses a specific "Float" shadow: `0 20px 40px -10px rgba(0,0,0,0.03)`. This creates a lifted effect that feels light and airy rather than heavy and grounded.
*   **Backdrop Blurs:** Decorative elements use a `blur-3xl` (approx. 40px-64px blur radius) to create soft, glowing orbs that sit behind content, adding "tonal depth" without affecting the layout flow.

### 5. Components
*   **Primary Button:** 56px height (h-14), background `primary`, text `surface`. Features a subtle group-hover transition where the trailing icon moves 4px to the right.
*   **Inputs:** 64px height for main NWC inputs; 48px for secondary fields. Use `border-muted/30` with a `focus:ring-2` transition. Corners are `rounded-lg` (16px).
*   **Selection Pill:** Use 24px height pills with 1.5pt dots for status indication (e.g., the Mint "Connected" tag).
*   **Dropdowns/Selects:** Custom chevron-down icon positioned 0.75rem from the right. Background is consistently `background-light` (F6F7F8).

### 6. Do's and Don'ts
*   **Do:** Use uppercase 11px Space Grotesk for all small labels to maintain a professional, editorial feel.
*   **Do:** Use the Lavender circle (48x48) for primary feature icons to create a recognizable "Action Start" point.
*   **Don't:** Use pure black for text. Always use `on_surface` (#334155) to maintain the soft "Midnight" aesthetic.
*   **Don't:** Use heavy shadows on buttons; let the high-contrast background color drive the hierarchy.
*   **Don't:** Mix the decorative blurs; keep Mint in one corner and Lavender in the other to maintain the "dual-energy" balance.