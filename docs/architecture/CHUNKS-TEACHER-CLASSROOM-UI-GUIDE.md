# CHUNKS Teacher Classroom Platform &bull; Implementation-Ready UI Guidance

**Mission:** Create implementation-ready, token-driven UI guidance for CHUNKS Teacher Classroom Platform that is optimized for consistency, accessibility, and fast delivery across dashboard web app.

---

## 1. Context and Goals

- **Product/Brand:** CHUNKS Teacher Classroom Platform
- **Live Deployment URL:** [https://chunks-test.genshai.workers.dev](https://chunks-test.genshai.workers.dev)
- **Primary Audience:** Authenticated teachers, assessors, school operators, and guest evaluators.
- **Product Surface:** High-density, real-time telemetry observation and assessment dashboard web app.
- **Design Intent:** A content-first, structured, token-driven dashboard system prioritizing low cognitive load during high-speed classroom observation (100+ questions/session), strict WCAG 2.2 AA accessibility, and zero visual ambiguity.

---

## 2. Design Tokens and Foundations

### 2.1. Typography Tokens

```css
:root {
  --font-family-primary: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Noto Sans, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  --font-family-stack: var(--font-family-primary);
  
  /* Font size scale */
  --font-size-xs: 10px;
  --font-size-sm: 11px;
  --font-size-md: 12px; /* Base size */
  --font-size-base: 12px;
  --font-size-lg: 14px;
  --font-size-xl: 16px;
  --font-size-2xl: 18px;
  --font-size-3xl: 24px;

  /* Line heights & weights */
  --font-weight-base: 700;
  --font-line-height-base: 16px;
}
```

### 2.2. Color Palette Tokens

```css
:root {
  /* Text Tokens */
  --color-text-primary: #0a0a0a;
  --color-text-secondary: oklch(0.705 0.015 286.067);
  --color-text-tertiary: oklch(0.442 0.017 285.786);
  --color-text-inverse: oklch(0.274 0.006 286.033);

  /* Surface Tokens */
  --color-surface-base: #000000;
  --color-surface-muted: oklch(0.967 0.001 286.375);
  --color-surface-raised: oklch(0.985 0 none);
  --color-surface-strong: #ffffff;

  /* Border Tokens */
  --color-border-muted: oklch(0.92 0.004 286.32);
}
```

### 2.3. Spacing Scale Tokens

| Token | Value | Target Usage |
|---|---|---|
| `--space-1` | `4px` | Micro-gaps between badge icons and text |
| `--space-2` | `6px` | Compact button internal padding, table cell gaps |
| `--space-3` | `8px` | Standard element spacing within card rows |
| `--space-4` | `10px` | Input internal padding, modal gutter |
| `--space-5` | `12px` | Card internal padding, cluster gap |
| `--space-6` | `16px` | Section margins, panel interior padding |
| `--space-7` | `20px` | Page content margins, grid gaps |
| `--space-8` | `32px` | Major dashboard container separation |

### 2.4. Radius, Shadows & Motion Tokens

```css
:root {
  /* Radius */
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;

  /* Telemetric Shadows */
  --shadow-1: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-2: 0 1px 0 0 rgba(0, 0, 0, 0.05);
  --shadow-3: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);

  /* Motion */
  --motion-duration-instant: 150ms;
  --motion-duration-fast: 200ms;
}
```

---

## 3. Component-Level Rules

Every component must strictly consume tokens and implement 7 explicit lifecycle states: **Default, Hover, Focus-Visible, Active, Disabled, Loading, Error**.

### 3.1. Buttons (`.btn`, `button`)
- **Anatomy:** Icon (optional, 14px) + Label (12px bold) + Container.
- **Variants:**
  - `Primary`: `background: var(--color-text-primary)` (or theme accent), `color: var(--color-surface-strong)`, `border-radius: var(--radius-sm)`.
  - `Ghost`: `background: transparent`, `color: var(--color-text-primary)`, `border: 1px solid var(--color-border-muted)`.
  - `Danger`: High-contrast destructive red with explicit confirm modals.
- **States:**
  - *Default:* Minimum target 40px &times; 36px on mobile/tablet.
  - *Hover:* Slight elevation shift with `transition: var(--motion-duration-instant)`.
  - *Focus-Visible:* `outline: 2px solid var(--color-text-primary); outline-offset: 2px`.
  - *Active:* `transform: scale(0.97)`.
  - *Disabled:* `opacity: 0.45; cursor: not-allowed; pointer-events: none`.
  - *Loading:* Replaces icon with `<Loader2 className="animate-spin" />` while preserving button dimensions.

### 3.2. Form Inputs (`input[type="text"]`, `select`)
- **Anatomy:** Field Label (`--font-size-sm`, bold) + Input Field (`padding: var(--space-4)`, `--font-size-md`) + Error/Help text (`--font-size-xs`).
- **States:**
  - *Default:* Border `var(--color-border-muted)`, Background `var(--color-surface-strong)`.
  - *Focus-Visible:* Outline 2px solid `#0a0a0a` with offset.
  - *Error:* Border `#dc2626` with descriptive text underneath (never rely on color alone).

### 3.3. Cards & Panels (`.panel`, `.stat-card`, `.learner-card`)
- **Anatomy:** Header (Title + Meta + Actions) + Body + Footer (optional).
- **Tokens:** Border `1px solid var(--color-border-muted)`, Background `var(--color-surface-strong)`, Radius `var(--radius-md)`, Shadow `var(--shadow-1)`.
- **View Modes:**
  - `Card Grid`: Multi-column responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
  - `List View`: High-density tabular layout.

---

## 4. Accessibility Requirements & Acceptance Criteria (WCAG 2.2 AA)

1. **Contrast Constraints (PASS/FAIL):**
   - Normal text (`--font-size-md` and below) must maintain a minimum contrast ratio of **4.5:1** against its background.
   - Large text (`--font-size-2xl` and above) must maintain a minimum contrast ratio of **3.0:1**.
   - Input borders and interactive components must maintain a minimum contrast of **3.0:1** against adjacent background.
2. **Keyboard-First Navigation (PASS/FAIL):**
   - Every interactive control must be reachable via `Tab` / `Shift+Tab`.
   - Grid cards must allow selection using `Enter` or `Space`.
   - Popovers and dialogs must close on `Escape` and trap focus while open.
3. **Focus-Visible Requirement (PASS/FAIL):**
   - No hidden focus rings permitted (`outline: none` without replacement is strictly forbidden).
   - Mandatory rule: `:focus-visible { outline: 2px solid var(--color-text-primary); outline-offset: 2px; }`.

---

## 5. Content and Tone Standards

- **Tone:** Concise, confident, implementation-focused.
- **Labels:** Action-oriented verbs (e.g., `Start Day 1`, `Observe`, `Resolve Probe`, `Finalize`).
- **Forbidden:** Casual hedging ("maybe", "could be"), decorative filler, vague labels ("Click here", "Submit").

---

## 6. Prohibited Anti-Patterns

- ❌ NEVER use raw hex values (e.g. `#1e293b`) in component styles; MUST use CSS tokens (`var(--color-...)`).
- ❌ NEVER hide focus outlines on interactive elements without an accessible equivalent.
- ❌ NEVER construct one-off padding/margin rules outside the 8-step spacing scale.
- ❌ NEVER use font sizes below `10px` (`--font-size-xs`).
- ❌ NEVER display critical status (e.g., pass/fail/error) using color alone without accompanying text or icon indicators.

---

## 7. QA Checklist

- [x] Font stack `-apple-system, BlinkMacSystemFont, Segoe UI...` applied to `html` and `body`.
- [x] Base font size locked at `12px` with 16px line height.
- [x] Colors mapped to `--color-text-*` and `--color-surface-*` tokens.
- [x] Keyboard focus visible across all buttons, inputs, and card selections.
- [x] High-density telemetry observe controls respond within 150ms instant motion.
- [x] Build and typecheck passes with 0 diagnostics.
