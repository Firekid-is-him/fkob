const crypto = require('crypto')
const { argon2id } = require('hash-wasm')
const container = require('./container')

const DEK_LENGTH = 32
const CONTENT_NONCE_LENGTH = 12
const KEY_SLOT_NONCE_LENGTH = 12
const PASSWORD_SALT_LENGTH = 16

const ARGON2_ITERATIONS = 3
const ARGON2_MEMORY_KB = 65536
const ARGON2_PARALLELISM = 1

function generateDEK() {
  return crypto.randomBytes(DEK_LENGTH)
}

function generateRawKey() {
  return crypto.randomBytes(DEK_LENGTH)
}

function rawKeyToHex(rawKey) {
  return rawKey.toString('hex')
}

function hexToRawKey(hex) {
  const trimmed = hex.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(trimmed)) {
    throw new Error('Key must be a 64 character hexadecimal string')
  }
  return Buffer.from(trimmed, 'hex')
}

async function deriveKeyFromPassword(password, salt) {
  const derived = await argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KB,
    hashLength: DEK_LENGTH,
    outputType: 'binary'
  })
  return Buffer.from(derived)
}

function wrapDEK(dek, wrappingKey) {
  const nonce = crypto.randomBytes(KEY_SLOT_NONCE_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, nonce)
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()])
  const tag = cipher.getAuthTag()
  return { wrapped, nonce, tag }
}

function unwrapDEK(slot, wrappingKey) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', wrappingKey, slot.nonce)
  decipher.setAuthTag(slot.tag)
  try {
    return Buffer.concat([decipher.update(slot.wrapped), decipher.final()])
  } catch {
    throw new Error('Incorrect key or password')
  }
}

function encryptContent(plaintext, dek) {
  const nonce = crypto.randomBytes(CONTENT_NONCE_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext, nonce, tag }
}

function decryptContent(ciphertext, dek, nonce, tag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, nonce)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error('Decryption failed: wrong key, wrong password, or file has been corrupted')
  }
}

async function encryptBuffer(plaintext, options) {
  const { rawKey, password } = options
  if (!rawKey && !password) {
    throw new Error('At least one of rawKey or password must be provided')
  }

  const dek = generateDEK()

  let keySlot = null
  let passwordSlot = null
  let generatedRawKey = null

  if (rawKey === true) {
    generatedRawKey = generateRawKey()
    keySlot = wrapDEK(dek, generatedRawKey)
  } else if (rawKey) {
    keySlot = wrapDEK(dek, rawKey)
  }

  if (password) {
    const salt = crypto.randomBytes(PASSWORD_SALT_LENGTH)
    const derivedKey = await deriveKeyFromPassword(password, salt)
    const wrapped = wrapDEK(dek, derivedKey)
    passwordSlot = { salt, ...wrapped }
  }

  const { ciphertext, nonce, tag } = encryptContent(plaintext, dek)

  const header = container.buildHeader({
    keySlot,
    passwordSlot,
    contentNonce: nonce,
    contentTag: tag
  })

  return {
    output: Buffer.concat([header, ciphertext]),
    generatedRawKey
  }
}

async function decryptBuffer(fileBuffer, options) {
  const { rawKey, password } = options
  if (!rawKey && !password) {
    throw new Error('At least one of rawKey or password must be provided')
  }

  const parsed = container.parseHeader(fileBuffer)
  let dek = null

  if (rawKey && parsed.hasKeySlot) {
    dek = unwrapDEK(parsed.keySlot, rawKey)
  } else if (password && parsed.hasPasswordSlot) {
    const derivedKey = await deriveKeyFromPassword(password, parsed.passwordSlot.salt)
    dek = unwrapDEK(parsed.passwordSlot, derivedKey)
  } else if (rawKey && !parsed.hasKeySlot) {
    throw new Error('This file was not encrypted with key mode')
  } else if (password && !parsed.hasPasswordSlot) {
    throw new Error('This file was not encrypted with password mode')
  }

  const plaintext = decryptContent(parsed.ciphertext, dek, parsed.contentNonce, parsed.contentTag)
  return plaintext
}

module.exports = {
  DEK_LENGTH,
  generateDEK,
  generateRawKey,
  rawKeyToHex,
  hexToRawKey,
  deriveKeyFromPassword,
  wrapDEK,
  unwrapDEK,
  encryptContent,
  decryptContent,
  encryptBuffer,
  decryptBuffer
}
