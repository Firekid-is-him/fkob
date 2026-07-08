const test = require('node:test')
const assert = require('node:assert')
const cryptoCore = require('../src/crypto-core')
const container = require('../src/container')

test('key mode encrypts and decrypts correctly', async () => {
  const plaintext = Buffer.from('hello firekid')
  const result = await cryptoCore.encryptBuffer(plaintext, { rawKey: true })
  const decrypted = await cryptoCore.decryptBuffer(result.output, { rawKey: result.generatedRawKey })
  assert.strictEqual(decrypted.toString(), plaintext.toString())
})

test('password mode encrypts and decrypts correctly', async () => {
  const plaintext = Buffer.from('password protected secret')
  const result = await cryptoCore.encryptBuffer(plaintext, { password: 'correct-horse-battery-staple' })
  const decrypted = await cryptoCore.decryptBuffer(result.output, { password: 'correct-horse-battery-staple' })
  assert.strictEqual(decrypted.toString(), plaintext.toString())
})

test('wrong password fails to decrypt', async () => {
  const plaintext = Buffer.from('secret data')
  const result = await cryptoCore.encryptBuffer(plaintext, { password: 'right-password' })
  await assert.rejects(
    cryptoCore.decryptBuffer(result.output, { password: 'wrong-password' })
  )
})

test('wrong key fails to decrypt', async () => {
  const plaintext = Buffer.from('secret data')
  const result = await cryptoCore.encryptBuffer(plaintext, { rawKey: true })
  const wrongKey = cryptoCore.generateRawKey()
  await assert.rejects(
    cryptoCore.decryptBuffer(result.output, { rawKey: wrongKey })
  )
})

test('both key and password independently unlock the same file', async () => {
  const plaintext = Buffer.from('double locked data')
  const result = await cryptoCore.encryptBuffer(plaintext, { rawKey: true, password: 'shared-secret' })

  const decryptedViaKey = await cryptoCore.decryptBuffer(result.output, { rawKey: result.generatedRawKey })
  const decryptedViaPassword = await cryptoCore.decryptBuffer(result.output, { password: 'shared-secret' })

  assert.strictEqual(decryptedViaKey.toString(), plaintext.toString())
  assert.strictEqual(decryptedViaPassword.toString(), plaintext.toString())
})

test('tampered ciphertext fails to decrypt', async () => {
  const plaintext = Buffer.from('tamper test')
  const result = await cryptoCore.encryptBuffer(plaintext, { rawKey: true })

  const tampered = Buffer.from(result.output)
  tampered[tampered.length - 1] ^= 0xff

  await assert.rejects(
    cryptoCore.decryptBuffer(tampered, { rawKey: result.generatedRawKey })
  )
})

test('encryptBuffer throws if neither rawKey nor password is provided', async () => {
  const plaintext = Buffer.from('data')
  await assert.rejects(
    cryptoCore.encryptBuffer(plaintext, {})
  )
})

test('decryptBuffer throws if neither rawKey nor password is provided', async () => {
  const plaintext = Buffer.from('data')
  const result = await cryptoCore.encryptBuffer(plaintext, { rawKey: true })
  await assert.rejects(
    cryptoCore.decryptBuffer(result.output, {})
  )
})

test('hexToRawKey rejects invalid input', () => {
  assert.throws(() => cryptoCore.hexToRawKey('not a valid key'))
  assert.throws(() => cryptoCore.hexToRawKey('abc123'))
})

test('hexToRawKey accepts a valid 64 character hex string', () => {
  const rawKey = cryptoCore.generateRawKey()
  const hex = cryptoCore.rawKeyToHex(rawKey)
  const parsed = cryptoCore.hexToRawKey(hex)
  assert.ok(parsed.equals(rawKey))
})

test('generated raw keys are unique', () => {
  const key1 = cryptoCore.generateRawKey()
  const key2 = cryptoCore.generateRawKey()
  assert.ok(!key1.equals(key2))
})

test('container isValidContainer correctly identifies fkobf files', async () => {
  const plaintext = Buffer.from('data')
  const result = await cryptoCore.encryptBuffer(plaintext, { rawKey: true })
  assert.strictEqual(container.isValidContainer(result.output), true)
  assert.strictEqual(container.isValidContainer(Buffer.from('not a real file')), false)
})

test('container header correctly reports which slots are present', async () => {
  const plaintext = Buffer.from('data')

  const keyOnly = await cryptoCore.encryptBuffer(plaintext, { rawKey: true })
  const keyOnlyParsed = container.parseHeader(keyOnly.output)
  assert.strictEqual(keyOnlyParsed.hasKeySlot, true)
  assert.strictEqual(keyOnlyParsed.hasPasswordSlot, false)

  const passwordOnly = await cryptoCore.encryptBuffer(plaintext, { password: 'test' })
  const passwordOnlyParsed = container.parseHeader(passwordOnly.output)
  assert.strictEqual(passwordOnlyParsed.hasKeySlot, false)
  assert.strictEqual(passwordOnlyParsed.hasPasswordSlot, true)

  const both = await cryptoCore.encryptBuffer(plaintext, { rawKey: true, password: 'test' })
  const bothParsed = container.parseHeader(both.output)
  assert.strictEqual(bothParsed.hasKeySlot, true)
  assert.strictEqual(bothParsed.hasPasswordSlot, true)
})
