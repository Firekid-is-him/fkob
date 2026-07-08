const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const cryptoCore = require('../src/crypto-core')
const zipHandler = require('../src/zip-handler')
const obfuscateCore = require('../src/obfuscate-core')

const PORT = Number(process.env.FKOBF_GUI_PORT) || 7331
const PUBLIC_DIR = path.join(__dirname, 'public')
const TEMP_DIR = path.join(os.tmpdir(), 'fkobf-gui')

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let totalLength = 0
    const maxLength = 1024 * 1024 * 1024

    req.on('data', (chunk) => {
      totalLength += chunk.length
      if (totalLength > maxLength) {
        reject(new Error('Upload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+)$/)
  if (!boundaryMatch) {
    throw new Error('No multipart boundary found')
  }

  const boundary = Buffer.from(`--${boundaryMatch[1]}`)
  const parts = []
  let start = buffer.indexOf(boundary)

  while (start !== -1) {
    const nextBoundary = buffer.indexOf(boundary, start + boundary.length)
    if (nextBoundary === -1) break

    const partBuffer = buffer.subarray(start + boundary.length, nextBoundary)
    const headerEnd = partBuffer.indexOf('\r\n\r\n')
    if (headerEnd !== -1) {
      const headerText = partBuffer.subarray(0, headerEnd).toString('utf8')
      let content = partBuffer.subarray(headerEnd + 4)
      if (content.subarray(content.length - 2).toString() === '\r\n') {
        content = content.subarray(0, content.length - 2)
      }

      const nameMatch = headerText.match(/name="([^"]+)"/)
      const filenameMatch = headerText.match(/filename="([^"]*)"/)

      parts.push({
        name: nameMatch ? nameMatch[1] : null,
        filename: filenameMatch ? filenameMatch[1] : null,
        content
      })
    }

    start = nextBoundary
  }

  return parts
}

function fieldValue(parts, name) {
  const part = parts.find((p) => p.name === name && !p.filename)
  return part ? part.content.toString('utf8') : null
}

function fileParts(parts, name) {
  return parts.filter((p) => p.name === name && p.filename)
}

async function handleEncrypt(req, res) {
  const contentType = req.headers['content-type'] || ''
  const body = await readRequestBody(req)
  const parts = parseMultipart(body, contentType)

  const mode = fieldValue(parts, 'mode')
  const password = fieldValue(parts, 'password')
  const hideNames = fieldValue(parts, 'hideNames') === 'true'
  const relativePaths = fieldValue(parts, 'relativePaths')
  const files = fileParts(parts, 'files')

  if (files.length === 0) {
    sendJSON(res, 400, { error: 'No files provided' })
    return
  }

  const wantsKey = mode === 'key' || mode === 'both'
  const wantsPassword = mode === 'password' || mode === 'both'

  if (!wantsKey && !wantsPassword) {
    sendJSON(res, 400, { error: 'At least one unlock method must be selected' })
    return
  }

  if (wantsPassword && !password) {
    sendJSON(res, 400, { error: 'Password mode selected but no password provided' })
    return
  }

  const sharedRawKey = wantsKey ? cryptoCore.generateRawKey() : undefined
  const paths = relativePaths ? JSON.parse(relativePaths) : files.map((f) => f.filename)

  if (files.length === 1 && files[0].filename.toLowerCase().endsWith('.zip')) {
    const tempZipPath = path.join(TEMP_DIR, `${crypto.randomUUID()}.zip`)
    fs.writeFileSync(tempZipPath, files[0].content)

    const outputPath = await zipHandler.encryptZip(tempZipPath, {
      rawKey: sharedRawKey,
      password: wantsPassword ? password : undefined,
      hideNames
    })

    const outputBuffer = fs.readFileSync(outputPath)
    fs.unlinkSync(tempZipPath)
    fs.unlinkSync(outputPath)

    sendJSON(res, 200, {
      key: sharedRawKey ? cryptoCore.rawKeyToHex(sharedRawKey) : null,
      files: [{
        name: path.basename(files[0].filename).replace(/\.zip$/i, '') + '.fkob.zip',
        data: outputBuffer.toString('base64')
      }]
    })
    return
  }

  const outputFiles = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const relativePath = paths[i] || file.filename

    const result = await cryptoCore.encryptBuffer(file.content, {
      rawKey: sharedRawKey,
      password: wantsPassword ? password : undefined
    })

    outputFiles.push({
      name: relativePath + '.fkob',
      data: result.output.toString('base64')
    })
  }

  sendJSON(res, 200, {
    key: sharedRawKey ? cryptoCore.rawKeyToHex(sharedRawKey) : null,
    files: outputFiles
  })
}

async function handleDecrypt(req, res) {
  const contentType = req.headers['content-type'] || ''
  const body = await readRequestBody(req)
  const parts = parseMultipart(body, contentType)

  const keyHex = fieldValue(parts, 'key')
  const password = fieldValue(parts, 'password')
  const relativePaths = fieldValue(parts, 'relativePaths')
  const files = fileParts(parts, 'files')

  if (files.length === 0) {
    sendJSON(res, 400, { error: 'No files provided' })
    return
  }

  if (!keyHex && !password) {
    sendJSON(res, 400, { error: 'Provide a key or a password' })
    return
  }

  let rawKey
  try {
    rawKey = keyHex ? cryptoCore.hexToRawKey(keyHex) : undefined
  } catch (error) {
    sendJSON(res, 400, { error: error.message })
    return
  }

  const paths = relativePaths ? JSON.parse(relativePaths) : files.map((f) => f.filename)

  if (files.length === 1 && files[0].filename.toLowerCase().endsWith('.fkob.zip')) {
    const tempZipPath = path.join(TEMP_DIR, `${crypto.randomUUID()}.fkob.zip`)
    fs.writeFileSync(tempZipPath, files[0].content)

    try {
      const outputPath = await zipHandler.decryptZip(tempZipPath, { rawKey, password })
      const outputBuffer = fs.readFileSync(outputPath)
      fs.unlinkSync(tempZipPath)
      fs.unlinkSync(outputPath)

      sendJSON(res, 200, {
        files: [{
          name: path.basename(files[0].filename).replace(/\.fkob\.zip$/i, '') + '.zip',
          data: outputBuffer.toString('base64')
        }]
      })
    } catch (error) {
      fs.unlinkSync(tempZipPath)
      sendJSON(res, 400, { error: error.message })
    }
    return
  }

  const outputFiles = []

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relativePath = paths[i] || file.filename
      const plaintext = await cryptoCore.decryptBuffer(file.content, { rawKey, password })

      outputFiles.push({
        name: relativePath.endsWith('.fkob') ? relativePath.slice(0, -5) : relativePath,
        data: plaintext.toString('base64')
      })
    }
  } catch (error) {
    sendJSON(res, 400, { error: error.message })
    return
  }

  sendJSON(res, 200, { files: outputFiles })
}

async function handleObfuscate(req, res) {
  const contentType = req.headers['content-type'] || ''
  const body = await readRequestBody(req)
  const parts = parseMultipart(body, contentType)

  const preset = fieldValue(parts, 'preset') || 'medium'
  const relativePaths = fieldValue(parts, 'relativePaths')
  const files = fileParts(parts, 'files')

  if (files.length === 0) {
    sendJSON(res, 400, { error: 'No files provided' })
    return
  }

  const paths = relativePaths ? JSON.parse(relativePaths) : files.map((f) => f.filename)
  const outputFiles = []

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relativePath = paths[i] || file.filename
      const sourceCode = file.content.toString('utf8')
      const obfuscated = obfuscateCore.obfuscateCode(sourceCode, preset)

      outputFiles.push({
        name: relativePath,
        data: Buffer.from(obfuscated, 'utf8').toString('base64')
      })
    }
  } catch (error) {
    sendJSON(res, 400, { error: error.message })
    return
  }

  sendJSON(res, 200, { files: outputFiles })
}

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url
  filePath = path.join(PUBLIC_DIR, filePath)

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const ext = path.extname(filePath)
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css'
    }

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' })
    res.end(content)
  })
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/encrypt') {
      await handleEncrypt(req, res)
      return
    }

    if (req.method === 'POST' && req.url === '/api/decrypt') {
      await handleDecrypt(req, res)
      return
    }

    if (req.method === 'POST' && req.url === '/api/obfuscate') {
      await handleObfuscate(req, res)
      return
    }

    serveStatic(req, res)
  } catch (error) {
    sendJSON(res, 500, { error: error.message })
  }
})

server.listen(PORT, () => {
  console.log(`fkobf GUI running at http://localhost:${PORT}`)
})
