import {
  Dirent,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { FSStaticStore, StaticGenStep } from "../../../src/";
import { hash } from "crypto";
import path from "path";

jest.mock("tiktoken", () => ({
  encode: jest.fn().mockReturnValue(["hashedident"]),
}));

jest.mock("fs");
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  hash: jest.fn().mockReturnValue("hashedident"),
}));

jest.mock("fs");
jest.mock("crypto", () => ({
  hash: jest.fn().mockReturnValue("hashedident"),
}));

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<
  typeof writeFileSync
>;

const stepsDirPath = path.join(process.cwd(), ".static/steps");

describe("FSStaticStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should create steps directory if it does not exist", () => {
    mockExistsSync.mockReturnValueOnce(false);
    FSStaticStore.fetchStatic("testIdent");
    expect(mockMkdirSync).toHaveBeenCalledWith(stepsDirPath, {
      recursive: true,
    });
  });

  test("should fetch static step if exists", () => {
    const ident = "testIdent";
    const expression = 'console.log("test");';
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce(Buffer.from(expression));

    const result = FSStaticStore.fetchStatic(ident);

    expect(result).toEqual({
      ident,
      expression,
    });
    expect(mockReadFileSync).toHaveBeenCalledWith(
      path.join(stepsDirPath, "hashedident.gen.step")
    );
  });

  test("should return undefined if static step does not exist", () => {
    const ident = "testIdent";
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error("File not found");
    });

    const result = FSStaticStore.fetchStatic(ident);

    expect(result).toBeUndefined();
  });

  test("should write static step", () => {
    const staticInfo: StaticGenStep = {
      ident: "testIdent",
      expression: 'console.log("test");',
    };

    FSStaticStore.makeStatic(staticInfo);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(stepsDirPath, "hashedident.gen.step"),
      staticInfo.expression,
      { flag: "wx" }
    );
  });
});
