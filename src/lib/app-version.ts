/**
 * App version + build date surfaced in the About dialog. The version is the
 * single source of truth from package.json (bumped via `npm version`); the build
 * date is stamped by Vite's `define` at build time and falls back to empty in
 * dev/test where the define isn't applied.
 */
import { version } from "../../package.json";

declare const __FLOW_BUILD_DATE__: string | undefined;

export const APP_VERSION = version;

export const APP_BUILD_DATE =
  typeof __FLOW_BUILD_DATE__ === "string" ? __FLOW_BUILD_DATE__ : "";
