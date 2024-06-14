export type StaticData = string | NodeJS.ArrayBufferView;

export interface IOWriter {
  /**
   * Fetches data by its filename.
   * @param {string} ident - The identifier.
   * @returns {Promise<StaticData | undefined>} Promise resolving on read complete, returns data that has just been read.
   */
  read: (filename: string) => Promise<StaticData | undefined>;

  /**
   * Writes some static data by ident key.
   * @param {string} ident - Data identifier the saved data will be associated with.
   * @param {string} data - Data to be saved.
   * @return {Promise<void>} - Promise resolving on write end.
   */
  write: (filename: string, data: StaticData) => Promise<void>;
}
