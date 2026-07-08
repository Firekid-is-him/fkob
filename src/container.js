const MAGIC = Buffer.from('FKOB', 'ascii')
const VERSION = 1

const FLAG_HAS_KEY_SLOT = 1
const FLAG_HAS_PASSWORD_SLOT = 2

const KEY_SLOT_WRAPPED_LENGTH = 32
const KEY_SLOT_NONCE_LENGTH = 12
const KEY_SLOT_TAG_LENGTH = 16
const KEY_SLOT_TOTAL_LENGTH = KEY_SLOT_WRAPPED_LENGTH + KEY_SLOT_NONCE_LENGTH + KEY_SLOT_TAG_LENGTH

const PASSWORD_SALT_LENGTH = 16
const PASSWORD_SLOT_TOTAL_LENGTH = PASSWORD_SALT_LENGTH + KEY_SLOT_TOTAL_LENGTH

const CONTENT_NONCE_LENGTH = 12
const CONTENT_TAG_LENGTH = 16

function buildHeader(options) {
  const { keySlot, passwordSlot, contentNonce, contentTag } = options
  let flags = 0
  if (keySlot) flags |= FLAG_HAS_KEY_SLOT
  if (passwordSlot) flags |= FLAG_HAS_PASSWORD_SLOT

  const parts = [MAGIC, Buffer.from([VERSION]), Buffer.from([flags])]

  if (keySlot) {
    parts.push(keySlot.wrapped, keySlot.nonce, keySlot.tag)
  }

  if (passwordSlot) {
    parts.push(passwordSlot.salt, passwordSlot.wrapped, passwordSlot.nonce, passwordSlot.tag)
  }

  parts.push(contentNonce, contentTag)

  return Buffer.concat(parts)
}

function parseHeader(buffer) {
  if (buffer.length < 6) {
    throw new Error('File too small to contain a valid fkobf header')
  }

  const magic = buffer.subarray(0, 4)
  if (!magic.equals(MAGIC)) {
    throw new Error('Not a valid fkobf file: magic bytes do not match')
  }

  const version = buffer.readUInt8(4)
  if (version !== VERSION) {
    throw new Error(`Unsupported fkobf format version: ${version}`)
  }

  const flags = buffer.readUInt8(5)
  const hasKeySlot = Boolean(flags & FLAG_HAS_KEY_SLOT)
  const hasPasswordSlot = Boolean(flags & FLAG_HAS_PASSWORD_SLOT)

  let offset = 6
  let keySlot = null
  let passwordSlot = null

  if (hasKeySlot) {
    const wrapped = buffer.subarray(offset, offset + KEY_SLOT_WRAPPED_LENGTH)
    offset += KEY_SLOT_WRAPPED_LENGTH
    const nonce = buffer.subarray(offset, offset + KEY_SLOT_NONCE_LENGTH)
    offset += KEY_SLOT_NONCE_LENGTH
    const tag = buffer.subarray(offset, offset + KEY_SLOT_TAG_LENGTH)
    offset += KEY_SLOT_TAG_LENGTH
    keySlot = { wrapped, nonce, tag }
  }

  if (hasPasswordSlot) {
    const salt = buffer.subarray(offset, offset + PASSWORD_SALT_LENGTH)
    offset += PASSWORD_SALT_LENGTH
    const wrapped = buffer.subarray(offset, offset + KEY_SLOT_WRAPPED_LENGTH)
    offset += KEY_SLOT_WRAPPED_LENGTH
    const nonce = buffer.subarray(offset, offset + KEY_SLOT_NONCE_LENGTH)
    offset += KEY_SLOT_NONCE_LENGTH
    const tag = buffer.subarray(offset, offset + KEY_SLOT_TAG_LENGTH)
    offset += KEY_SLOT_TAG_LENGTH
    passwordSlot = { salt, wrapped, nonce, tag }
  }

  const contentNonce = buffer.subarray(offset, offset + CONTENT_NONCE_LENGTH)
  offset += CONTENT_NONCE_LENGTH
  const contentTag = buffer.subarray(offset, offset + CONTENT_TAG_LENGTH)
  offset += CONTENT_TAG_LENGTH
  const ciphertext = buffer.subarray(offset)

  return {
    version,
    hasKeySlot,
    hasPasswordSlot,
    keySlot,
    passwordSlot,
    contentNonce,
    contentTag,
    ciphertext
  }
}

function isValidContainer(buffer) {
  try {
    parseHeader(buffer)
    return true
  } catch {
    return false
  }
}

module.exports = {
  MAGIC,
  VERSION,
  FLAG_HAS_KEY_SLOT,
  FLAG_HAS_PASSWORD_SLOT,
  KEY_SLOT_WRAPPED_LENGTH,
  KEY_SLOT_NONCE_LENGTH,
  KEY_SLOT_TAG_LENGTH,
  PASSWORD_SALT_LENGTH,
  CONTENT_NONCE_LENGTH,
  CONTENT_TAG_LENGTH,
  buildHeader,
  parseHeader,
  isValidContainer
}
