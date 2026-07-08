const test = require('node:test')
const assert = require('node:assert')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const obfuscateCore = require('../src/obfuscate-core')

function runNodeCode(code) {
  const tempFile = path.join(os.tmpdir(), `fkobf-test-${Date.now()}-${Math.random().toString(36).slice(2)}.js`)
  fs.writeFileSync(tempFile, code)
  try {
    return execSync(`node ${tempFile}`, { encoding: 'utf8' }).trim()
  } finally {
    fs.unlinkSync(tempFile)
  }
}

test('light preset produces runnable code with correct output', () => {
  const source = "function add(a,b){if(a>0){return a+b}else{return b-a}}console.log(add(3,4))"
  const obfuscated = obfuscateCore.obfuscateCode(source, 'light')
  const output = runNodeCode(obfuscated)
  assert.strictEqual(output, '7')
})

test('medium preset produces runnable code with correct output', () => {
  const source = "function add(a,b){if(a>0){return a+b}else{return b-a}}console.log(add(3,4))"
  const obfuscated = obfuscateCore.obfuscateCode(source, 'medium')
  const output = runNodeCode(obfuscated)
  assert.strictEqual(output, '7')
})

test('heavy preset produces runnable code with correct output', () => {
  const source = "function add(a,b){if(a>0){return a+b}else{return b-a}}console.log(add(3,4))"
  const obfuscated = obfuscateCore.obfuscateCode(source, 'heavy')
  const output = runNodeCode(obfuscated)
  assert.strictEqual(output, '7')
})

test('obfuscated output no longer contains original identifier names', () => {
  const source = "function calculateTotalPrice(itemPrice, quantity) { return itemPrice * quantity; }"
  const obfuscated = obfuscateCore.obfuscateCode(source, 'medium')
  assert.ok(!obfuscated.includes('calculateTotalPrice'))
})

test('heavy preset output is meaningfully larger than light preset for the same input', () => {
  const source = "function add(a,b){if(a>0){return a+b}else{return b-a}}function multiply(x,y){let result=0;for(let i=0;i<y;i++){result+=x}return result}"
  const light = obfuscateCore.obfuscateCode(source, 'light')
  const heavy = obfuscateCore.obfuscateCode(source, 'heavy')
  assert.ok(heavy.length > light.length)
})

test('unknown preset throws a clear error', () => {
  assert.throws(() => obfuscateCore.obfuscateCode('const a = 1;', 'nonexistent'))
})

test('advanced flags override preset defaults', () => {
  const source = "function add(a,b){if(a>0){return a+b}else{return b-a}}"
  const withoutFlattening = obfuscateCore.obfuscateCode(source, 'light', { controlFlow: false })
  const withFlattening = obfuscateCore.obfuscateCode(source, 'light', { controlFlow: true })
  assert.notStrictEqual(withoutFlattening.length, withFlattening.length)
})

test('obfuscateFile reads and writes files correctly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fkobf-obf-test-'))
  const inputPath = path.join(dir, 'input.js')
  const outputPath = path.join(dir, 'output.js')

  fs.writeFileSync(inputPath, "console.log('test output')")
  obfuscateCore.obfuscateFile(inputPath, outputPath, 'light')

  assert.ok(fs.existsSync(outputPath))
  const output = runNodeCode(fs.readFileSync(outputPath, 'utf8'))
  assert.strictEqual(output, 'test output')
})
