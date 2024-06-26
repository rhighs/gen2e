import * as ts from "typescript";

export type TypescriptDiagnostic = {
  filename: string;
  line: number;
  char: number;
  message: string;
};

export function getDiagnostics(
  filenames: string[],
  options: ts.CompilerOptions
): TypescriptDiagnostic[] {
  const program = ts.createProgram(filenames, {
    noEmit: true,
    ...options,
  });
  const emitResult = program.emit();
  const tsDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  const diagnostics: TypescriptDiagnostic[] = tsDiagnostics
    .filter((d) => d.file)
    .map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
      const { line, character } = ts.getLineAndCharacterOfPosition(
        d.file!,
        d.start!
      );

      return {
        filename: d.file!.fileName,
        line: line + 1,
        char: character + 1,
        message,
      };
    });

  return diagnostics;
}
