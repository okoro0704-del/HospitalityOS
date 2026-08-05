/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOS_API_URL: string;
  readonly VITE_LIFEOS_API_URL: string;
  readonly VITE_LIFEOS_RETURN_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
