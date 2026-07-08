const fs = require('fs')
const path = require('path')

const FKOB_EXTENSION = '.fkob'

function walkDirectory(rootPath) {
  const results = []

  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        results.push(fullPath)
      }
    }
  }

  walk(rootPath)
  return results
}

function isFkobFile(filePath) {
  return filePath.endsWith(FKOB_EXTENSION)
}

function toEncryptedPath(originalPath) {
  return originalPath + FKOB_EXTENSION
}

function toDecryptedPath(fkobPath) {
  if (!isFkobFile(fkobPath)) {
    throw new Error(`Expected a ${FKOB_EXTENSION} file path`)
  }
  return fkobPath.slice(0, -FKOB_EXTENSION.length)
}

function collectTargetsForEncrypt(inputPath) {
  const stat = fs.statSync(inputPath)
  if (stat.isDirectory()) {
    return walkDirectory(inputPath).filter((filePath) => !isFkobFile(filePath))
  }
  if (stat.isFile()) {
    return [inputPath]
  }
  throw new Error(`Not a file or directory: ${inputPath}`)
}

function collectTargetsForDecrypt(inputPath) {
  const stat = fs.statSync(inputPath)
  if (stat.isDirectory()) {
    return walkDirectory(inputPath).filter(isFkobFile)
  }
  if (stat.isFile()) {
    if (!isFkobFile(inputPath)) {
      throw new Error(`Not a ${FKOB_EXTENSION} file: ${inputPath}`)
    }
    return [inputPath]
  }
  throw new Error(`Not a file or directory: ${inputPath}`)
}

module.exports = {
  FKOB_EXTENSION,
  walkDirectory,
  isFkobFile,
  toEncryptedPath,
  toDecryptedPath,
  collectTargetsForEncrypt,
  collectTargetsForDecrypt
}
