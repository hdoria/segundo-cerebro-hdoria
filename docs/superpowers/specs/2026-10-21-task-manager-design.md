# Console redesign: task-manager identity and genuine shadcn

## Approved request

Hugo requested the colors and design of `~/projects/task-manager`, centralized in a design system without scattered hardcoded values. He explicitly confirmed adding actual React + shadcn/ui while preserving the current engine and APIs. The existing Console has neither React nor shadcn. This is an interface migration, not merely renaming CSS classes.

Both starting repositories were clean. Console main and origin matched e7ae658; task-manager reference was08a2a2e. Work is isolated on codex/task-manager-design in the existing managed worktree. The live4782 instance remains on main until verification.

## Product and visual constraints

- Preserve every existing workspace, area selection, navigation, source opening, filters, loading/error/empty states, forms, action confirmations, keyboard shortcuts and accessible focus behavior.
- Preserve local source-of-truth, explicit data root, session/CSRF, privacy boundaries and strict CSP. Never fabricate state, measurements, dependencies or business results. No real-vault mutations during design QA.
- Adopt the established task-manager world: warm stone surfaces, indigo action accent, Geist/Geist Mono, four-point spacing, restrained6/8px corners, thin warm borders, quiet inset active navigation, aligned gutters and compact operational hierarchy.
- Source reference values from task-manager/src/styles/tokens.css and inventory from src/core/design-tokens.js. Reference code is vanilla; transfer identity, not its control implementation. Keep locally served fonts.
- Cover light/dark themes, desktop/mobile, controls/dialogs/tables and the G6 Canvas. Colors continue to distinguish object kind from operational state.

## Design-system architecture

A canonical token stylesheet contains primitive palette, semantic roles, scales, layout/control tokens, animation and viewport definitions. A JS inventory exposes token names and computed access without duplicating values. shadcn variables alias those semantic roles; component utilities use centralized scales. Legacy style consumers are migrated to tokens rather than appended override layers. Canvas paint/layout and any decorative visualization read shared tokens; runtime positions and measured data geometry remain data, not theme constants.

A live design-system catalog displays actual shared components and tokens. A repository check rejects undefined token references, literal visual values outside authoritative token definitions, and inventory drift. Generated CSS/bundles and numeric domain/geometry data are explicitly distinguished from authored visual decisions.

## React and shadcn architecture

React must own the rendered UI, with real locally vendored shadcn components and documented upstream provenance. Reuse the existing domain state, data loading, mutation/CSRF and action dispatch; avoid rewriting business behavior for a redesign.

An explicit renderer boundary may translate existing trusted, escaped view descriptors/markup into React elements using the actual shared component registry. It must not be an iframe, decorative island, fake shadcn CSS facade or dangerouslySetInnerHTML-based app. Buttons, inputs/selects/textarea, checkboxes, tables, tabs and modal/drawer primitives must use the shared React component system. NativeSelect is appropriate where preserving native mobile/select behavior matters. Synchronous compatibility at imperative integration boundaries must be bounded and explained.

DOM ownership is exclusive: nested React roots are disposed before parent replacement; G6 owns only its dedicated host. Private content appears only through existing explicit-open paths. React form/default values, delegated actions, disabled/pending state, focus restoration and stale-response guards must remain correct.

## Packaging and validation

Build JSX/Tailwind and Canvas in the developer checkout; ship local compiled JS/CSS/font assets. Installed Console still opens on Node20+ without npm install/build or CDN. Explicitly serve/package every new asset and keep the installed-release HTTP proof.

Validation includes existing appropriate workspace/backend/security regressions, behavioral React component tests, token audit and build; then all motor suites and native Linux/Windows/macOS CI. Browser proof uses synthetic data at desktop and390px in both themes: navigation, area selection, forms, filters, source drawer/Escape focus, command palette, confirmation, notices, metrics/history, tables and Canvas. No new real notice judgment/read state is changed by QA.

## Done

The complete visible Console follows the reference identity, uses actual React/shadcn, has no scattered authored visual literals, retains existing behavior and protection, installs from its package, passes independent code/design review, and is integrated/pushed with a reviewed live homologation. PRODUCT.md, DESIGN.md and token inventory describe the final implementation. No source or data is copied to the public fork from the private vault.
