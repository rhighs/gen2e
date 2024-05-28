/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAT_TITLE: string
  readonly VITE_APP_TITLE: string
  readonly VITE_API_HOST: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
