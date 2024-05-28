/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAT_TITLE: string
  readonly VITE_APP_TITLE: string
  readonly VITE_API_HOST: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export interface Gen2eInterface {
  interpret: (model: string, mode: string, tasks: string[]) => Promise<string>
}

declare global {
  interface Window {
    gen2e: Gen2eInterface
  }
}
