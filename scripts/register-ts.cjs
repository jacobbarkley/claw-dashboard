/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs")
const Module = require("module")
const path = require("path")
const ts = require("typescript")

const repoRoot = path.resolve(__dirname, "..")
const originalResolveFilename = Module._resolveFilename
const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".json"]

function existingPath(candidate) {
  for (const extension of extensions) {
    const filename = `${candidate}${extension}`
    if (fs.existsSync(filename) && fs.statSync(filename).isFile()) return filename
  }
  for (const extension of extensions.slice(1)) {
    const filename = path.join(candidate, `index${extension}`)
    if (fs.existsSync(filename) && fs.statSync(filename).isFile()) return filename
  }
  return null
}

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const resolved = existingPath(path.join(repoRoot, request.slice(2)))
    if (resolved) return resolved
  }

  if (request.startsWith(".") && parent?.filename) {
    const resolved = existingPath(path.resolve(path.dirname(parent.filename), request))
    if (resolved) return resolved
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}

function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8")
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  })
  module._compile(output.outputText, filename)
}

require.extensions[".ts"] = compileTs
require.extensions[".tsx"] = compileTs
