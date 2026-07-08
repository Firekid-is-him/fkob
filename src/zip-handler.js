const AdmZip = require('adm-zip')
const cryptoCore = require('./crypto-core')

const NAME_HEADER_MAGIC = Buffer.from('FKNM', 'ascii')

function encodeNamedPayload(originalName, content) {
  const nameBuffer = Buffer.from(originalName, 'utf8')
  const nameLength = Buffer.alloc(2)
  nameLength.writeUInt16BE(nameBuffer.length, 0)
  return Buffer.concat([NAME_HEADER_MAGIC, nameLength, nameBuffer, content])
}

function decodeNamedPayload(buffer) {
  const magic = buffer.subarray(0, 4)
  if (!magic.equals(NAME_HEADER_MAGIC)) {
    throw new Error('Entry does not contain an embedded filename')
  }
  const nameLength = buffer.readUInt16BE(4)
  const nameStart = 6
  const nameEnd = nameStart + nameLength
  const originalName = buffer.subarray(nameStart, nameEnd).toString('utf8')
  const content = buffer.subarray(nameEnd)
  return { originalName, content }
}

async function encryptZip(inputZipPath, options) {
  const { rawKey, password, hideNames } = options
  const sourceZip = new AdmZip(inputZipPath)
  const outputZip = new AdmZip()

  let effectiveRawKey = rawKey
  let generatedRawKey = null

  if (rawKey === true) {
    generatedRawKey = cryptoCore.generateRawKey()
    effectiveRawKey = generatedRawKey
  }

  const entries = sourceZip.getEntries()
  let index = 0

  for (const entry of entries) {
    if (entry.isDirectory) continue

    const originalData = entry.getData()
    let dataToEncrypt = originalData
    let outputEntryName = entry.entryName

    if (hideNames) {
      dataToEncrypt = encodeNamedPayload(entry.entryName, originalData)
      index += 1
      const paddedIndex = String(index).padStart(4, '0')
      outputEntryName = `${paddedIndex}.fkob`
    } else {
      outputEntryName = entry.entryName + '.fkob'
    }

    const result = await cryptoCore.encryptBuffer(dataToEncrypt, { rawKey: effectiveRawKey, password })
    outputZip.addFile(outputEntryName, result.output)
  }

  if (generatedRawKey && options.onKeyGenerated) {
    options.onKeyGenerated(generatedRawKey)
  }

  const outputPath = inputZipPath.replace(/\.zip$/i, '') + '.fkob.zip'
  outputZip.writeZip(outputPath)
  return outputPath
}

async function decryptZip(inputZipPath, options) {
  const { rawKey, password } = options
  const sourceZip = new AdmZip(inputZipPath)
  const outputZip = new AdmZip()

  const entries = sourceZip.getEntries()

  for (const entry of entries) {
    if (entry.isDirectory) continue
    if (!entry.entryName.endsWith('.fkob')) continue

    const encryptedData = entry.getData()
    const decrypted = await cryptoCore.decryptBuffer(encryptedData, { rawKey, password })

    let outputEntryName = entry.entryName.slice(0, -('.fkob'.length))
    let outputData = decrypted

    try {
      const named = decodeNamedPayload(decrypted)
      outputEntryName = named.originalName
      outputData = named.content
    } catch {
    }

    outputZip.addFile(outputEntryName, outputData)
  }

  const outputPath = inputZipPath.replace(/\.fkob\.zip$/i, '') + '.zip'
  outputZip.writeZip(outputPath)
  return outputPath
}

module.exports = {
  encryptZip,
  decryptZip,
  encodeNamedPayload,
  decodeNamedPayload
}
