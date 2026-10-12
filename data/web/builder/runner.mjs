import { build } from "vite";
import ts from "typescript";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, isAbsolute } from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const toolchain = fileURLToPath(new URL(".", import.meta.url));
const [snapshot, output] = process.argv.slice(2);

function inside(path, root) {
  const rel = relative(root, path);
  return !rel.startsWith("..") && !isAbsolute(rel);
}
function sources(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(resolve(folder, e.name))
      : /\.tsx?$/.test(e.name)
        ? [resolve(folder, e.name)]
        : [],
  );
}
// Inspect only author syntax, never execute author modules during the build.
function authorFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? authorFiles(resolve(folder, e.name))
      : /\.[jt]sx?$|\.mjs$/.test(e.name)
        ? [resolve(folder, e.name)]
        : [],
  );
}
for (const file of authorFiles(resolve(snapshot, "src"))) {
  const tree = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const check = (spec) => {
    if (spec.startsWith(".")) {
      if (!inside(resolve(file, "..", spec), snapshot))
        throw new Error("Import escapes source snapshot: " + spec);
    } else if (
      ![
        "react",
        "react-dom/client",
        "react/jsx-runtime",
        "@obs-tiktok/widgets-sdk",
        "@obs-tiktok/widgets-react",
      ].includes(spec)
    )
      throw new Error("Unsupported dependency or import protocol: " + spec);
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      check(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))
        throw new Error("Dynamic imports must use a static project path");
      check(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}
const files = sources(resolve(snapshot, "src"));
for (const file of files) {
  if (/<reference\s+(?:path|types)=/.test(readFileSync(file, "utf8")))
    throw new Error(
      "Author-controlled triple-slash references are not supported: " +
        relative(snapshot, file),
    );
}
const options = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  esModuleInterop: true,
  baseUrl: toolchain,
  paths: {
    "@obs-tiktok/widgets-sdk": ["sdk.ts"],
    "@obs-tiktok/widgets-react": ["react-sdk.ts"],
    react: ["node_modules/@types/react/index.d.ts"],
    "react/jsx-runtime": ["node_modules/@types/react/jsx-runtime.d.ts"],
    "react-dom/client": ["node_modules/@types/react-dom/client.d.ts"],
  },
};
const host = ts.createCompilerHost(options);
const originalRead = host.readFile;
host.readFile = (p) =>
  inside(p, snapshot) || inside(p, toolchain) ? originalRead(p) : undefined;
const program = ts.createProgram(files, options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    "WIDGET_DIAGNOSTICS:" +
      JSON.stringify(
        diagnostics.map((d) => {
          const pos = d.file?.getLineAndCharacterOfPosition(d.start || 0);
          return {
            file: d.file
              ? relative(snapshot, d.file.fileName).replaceAll("\\", "/")
              : "",
            line: pos ? pos.line + 1 : 0,
            column: pos ? pos.character + 1 : 0,
            code: d.code,
            message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
          };
        }),
      ),
  );
  console.error(
    ts.formatDiagnostics(diagnostics, {
      getCurrentDirectory: () => snapshot,
      getCanonicalFileName: (f) => f,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}
await build({
  configFile: false,
  envFile: false,
  root: resolve(snapshot, "src"),
  base: "./",
  publicDir: false,
  plugins: [
    {
      name: "managed-project-boundary",
      enforce: "pre",
      load(id) {
        const path = id.split("?")[0];
        if (
          isAbsolute(path) &&
          !inside(path, snapshot) &&
          !inside(path, toolchain)
        )
          throw new Error(
            "Resource outside immutable project/toolchain: " + path,
          );
        return null;
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "@obs-tiktok/widgets-sdk",
        replacement: resolve(toolchain, "sdk.ts"),
      },
      {
        find: "@obs-tiktok/widgets-react",
        replacement: resolve(toolchain, "react-sdk.ts"),
      },
      {
        find: /^react-dom(\/.*)?$/,
        replacement: resolve(toolchain, "node_modules/react-dom") + "$1",
      },
      {
        find: /^react(\/.*)?$/,
        replacement: resolve(toolchain, "node_modules/react") + "$1",
      },
    ],
  },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: output,
    emptyOutDir: true,
    target: "chrome100",
    sourcemap: true,
    minify: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 512,
    modulePreload: false,
    rollupOptions: {
      input: resolve(snapshot, "src/index.html"),
      output: { format: "iife", inlineDynamicImports: true },
    },
  },
});

// The trusted compiler emits one self-contained IIFE. Use a classic script so
// file:// system browsers and OBS http://absolute do not require module CORS.
const html = readFileSync(resolve(output, "index.html"), "utf8");
writeFileSync(
  resolve(output, "index.html"),
  html.replace(
    '<script type="module" crossorigin src="./assets/',
    '<script defer src="./assets/',
  ),
);
