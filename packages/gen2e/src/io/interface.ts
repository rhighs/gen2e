export type StaticData = string | NodeJS.ArrayBufferView;

export interface IOWriter {
  read: (filename: string) => Promise<StaticData | undefined>;

  /** Resolves with the full path written. */
  write: (filename: string, data: StaticData) => Promise<string>;
}
