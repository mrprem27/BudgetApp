/**
 * The QA screen's two whole-database actions (`app/storage.tsx`, behind
 * `DEV_TOOLS_ENABLED`). Routed through here so no screen reaches into `src/db`
 * (`uiLayering.test.ts`).
 */
export { resetToEmpty } from '../db/seedDemo';
export { loadDemoPersona, DEMO_PERSONAS, type DemoPersona } from '../db/demoPersonas';
