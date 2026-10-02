import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { FSStaticStore, type StaticGenStep } from "../../../src";

jest.mock("node:fs");
jest.mock(
  "tiktoken",
  () => ({
    encode: jest.fn(),
    encoding_for_model: jest.fn(() => ({ encode: () => [], free: jest.fn() })),
  }),
  { virtual: true },
);
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  hash: jest.fn().mockReturnValue("hashedident"),
}));

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
const mockLinkSync = linkSync as jest.MockedFunction<typeof linkSync>;
const mockUnlinkSync = unlinkSync as jest.MockedFunction<typeof unlinkSync>;
const mockRenameSync = renameSync as jest.MockedFunction<typeof renameSync>;

const stepsDirPath = ".static/steps";
const stepFilePath = `${stepsDirPath}/hashedident.gen.step`;

describe("FSStaticStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should fetch static step if exists", () => {
    const expression = 'console.log("test");';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValueOnce(Buffer.from(JSON.stringify({ expression })));

    const result = FSStaticStore.fetchStatic("testIdent");

    expect(result).toEqual({ expression });
    expect(mockReadFileSync).toHaveBeenCalledWith(stepFilePath);
  });

  test("should return undefined if static step does not exist", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error("File not found");
    });

    const result = FSStaticStore.fetchStatic("testIdent");

    expect(result).toBeUndefined();
  });

  test("should return undefined for malformed or empty entries", () => {
    mockExistsSync.mockReturnValue(true);

    mockReadFileSync.mockReturnValueOnce(Buffer.from(JSON.stringify({ expression: "" })));
    expect(FSStaticStore.fetchStatic("testIdent")).toBeUndefined();

    mockReadFileSync.mockReturnValueOnce(Buffer.from("not-json"));
    expect(FSStaticStore.fetchStatic("testIdent")).toBeUndefined();
  });

  test("should create the steps directory when writing", () => {
    const staticInfo: StaticGenStep = {
      expression: 'console.log("test");',
    };
    mockExistsSync.mockReturnValue(false);

    FSStaticStore.makeStatic("testIdent", staticInfo);

    expect(mockMkdirSync).toHaveBeenCalledWith(stepsDirPath, { recursive: true });
  });

  test("should write through a tmp file and link it into place", () => {
    const staticInfo: StaticGenStep = {
      expression: 'console.log("test");',
    };
    mockExistsSync.mockReturnValue(true);

    FSStaticStore.makeStatic("testIdent", staticInfo);

    const tmpPath = mockWriteFileSync.mock.calls[0][0] as string;
    expect(tmpPath).toMatch(/^\.static\/steps\/hashedident\.gen\.step\.tmp-\d+-\d+$/);
    expect(mockWriteFileSync).toHaveBeenCalledWith(tmpPath, JSON.stringify(staticInfo));
    expect(mockLinkSync).toHaveBeenCalledWith(tmpPath, stepFilePath);
    expect(mockUnlinkSync).toHaveBeenCalledWith(tmpPath);
    expect(mockRenameSync).not.toHaveBeenCalled();
  });

  test("should keep the first writer on contention", () => {
    mockExistsSync.mockReturnValue(true);
    mockLinkSync.mockImplementationOnce(() => {
      const err = new Error("file exists") as NodeJS.ErrnoException;
      err.code = "EEXIST";
      throw err;
    });

    expect(() => FSStaticStore.makeStatic("testIdent", { expression: "second" })).not.toThrow();
    expect(mockRenameSync).not.toHaveBeenCalled();
    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  test("should replace the entry when overwrite is requested", () => {
    const staticInfo: StaticGenStep = {
      expression: 'console.log("test");',
    };
    mockExistsSync.mockReturnValue(true);

    FSStaticStore.makeStatic("testIdent", staticInfo, { overwrite: true });

    const tmpPath = mockWriteFileSync.mock.calls[0][0] as string;
    expect(mockRenameSync).toHaveBeenCalledWith(tmpPath, stepFilePath);
    expect(mockLinkSync).not.toHaveBeenCalled();
  });

  test("should quarantine an existing entry", () => {
    mockExistsSync.mockReturnValue(true);

    FSStaticStore.quarantine?.("testIdent", "stale");

    expect(mockRenameSync).toHaveBeenCalledWith(
      stepFilePath,
      expect.stringMatching(/^\.static\/quarantine\/hashedident\.\d+\.gen\.step$/),
    );
  });

  test("should not quarantine a missing entry", () => {
    mockExistsSync.mockReturnValue(false);

    FSStaticStore.quarantine?.("testIdent", "stale");

    expect(mockRenameSync).not.toHaveBeenCalled();
  });
});
