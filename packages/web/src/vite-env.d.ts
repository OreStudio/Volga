/// <reference types="vite/client" />

/** SVG imports resolve to their URL. */
declare module '*.svg' {
  const url: string;
  export default url;
}
