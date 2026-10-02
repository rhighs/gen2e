import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FSStaticStore, StaticGenStep } from "../../../src";

jest.mock("node:fs");
jest.mock("tiktoken", () => ({
  encode: jest.fn(),
  encoding_for_model: jest.fn(() => ({ encode: () => [], free: jest.fn() })),
}));
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  hash: jest.fn().mockReturnValue("hashedident"),
}));

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<
  typeof writeFileSync
>;

const stepsDirPath = ".static/steps";
const stepFilePath = `${stepsDirPath}/hashedident.gen.step`;

describe("FSStaticStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should create steps directory if it does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    FSStaticStore.fetchStatic("testIdent");
    expect(mockMkdirSync).toHaveBeenCalledWith(stepsDirPath, {
      recursive: true,
    });
  });

  test("should fetch static step if exists", () => {
    const expression = 'console.log("test");';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValueOnce(
      Buffer.from(JSON.stringify({ expression }))
    );

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

  test("should write static step", () => {
    const staticInfo: StaticGenStep = {
      expression: 'console.log("test");',
    };

    FSStaticStore.makeStatic("testIdent", staticInfo);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      stepFilePath,
      JSON.stringify(staticInfo),
      { flag: "wx" }
    );
  });
});
