const fs = require('fs')
const JavaScriptObfuscator = require('javascript-obfuscator')

const PRESETS = {
  light: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: [],
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutputAt: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: true
  },
  medium: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutputAt: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: true
  },
  heavy: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 1,
    selfDefending: true,
    debugProtection: true,
    disableConsoleOutputAt: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: true
  }
}

const ADVANCED_FLAG_MAP = {
  rename: (enabled) => ({ identifierNamesGenerator: enabled ? 'hexadecimal' : 'mangled' }),
  controlFlow: (enabled) => ({ controlFlowFlattening: enabled }),
  deadCode: (enabled) => ({ deadCodeInjection: enabled }),
  stringEncrypt: (enabled) => ({ stringArray: enabled, stringArrayEncoding: enabled ? ['base64'] : [] }),
  selfDefending: (enabled) => ({ selfDefending: enabled }),
  debugProtect: (enabled) => ({ debugProtection: enabled }),
  noConsole: (enabled) => ({ disableConsoleOutputAt: enabled }),
  compact: (enabled) => ({ compact: enabled })
}

function buildOptions(preset, advancedFlags) {
  const base = PRESETS[preset]
  if (!base) {
    throw new Error(`Unknown obfuscation preset: ${preset}`)
  }

  let options = { ...base }

  if (advancedFlags) {
    for (const [flagName, value] of Object.entries(advancedFlags)) {
      const applier = ADVANCED_FLAG_MAP[flagName]
      if (applier) {
        options = { ...options, ...applier(value) }
      }
    }
  }

  return options
}

function obfuscateCode(sourceCode, preset, advancedFlags) {
  const options = buildOptions(preset || 'medium', advancedFlags)
  const result = JavaScriptObfuscator.obfuscate(sourceCode, options)
  return result.getObfuscatedCode()
}

function obfuscateFile(filePath, outputPath, preset, advancedFlags) {
  const sourceCode = fs.readFileSync(filePath, 'utf8')
  const obfuscated = obfuscateCode(sourceCode, preset, advancedFlags)
  fs.writeFileSync(outputPath, obfuscated, 'utf8')
  return outputPath
}

module.exports = {
  PRESETS,
  buildOptions,
  obfuscateCode,
  obfuscateFile
}
