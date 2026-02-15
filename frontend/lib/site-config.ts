/**
 * Site branding: name, logo, and favicon.
 * Change these to rebrand the app without editing multiple files.
 *
 * - Logo: use "icon" for the default icon, or a path (e.g. "/logo.svg" in public/)
 *   or full URL (for external URLs, add the host to next.config.mjs images.remotePatterns).
 * - Favicon: put your file in public/ (e.g. public/favicon.ico) and set favicon to "/favicon.ico".
 */

export const siteConfig = {
  /** Display name used in sidebar, login page, and document title */
  siteName: "Oper",

  /** "icon" = default radio icon; or path/URL to an image (e.g. "/logo.svg") */
  logo: "/logo.png" as "icon" | string,

  /** Favicon path; place file in public/ and reference as e.g. "/favicon.ico" */
  favicon: "/favicon.ico",

  /** Tagline on the login page */
  tagline: "Operator training simulator",
} as const

export type SiteConfig = typeof siteConfig
