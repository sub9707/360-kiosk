interface ImportMetaEnv {
  readonly VITE_BASE_DIRECTORY: string;
  readonly copyright:boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}