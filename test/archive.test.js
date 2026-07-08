const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const AdmZip = require('adm-zip')
const zipHandler = require('../src/zip-handler')
const archive = require('../src/archive')

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fkobf-test-'))
}

test('zip encrypt and decrypt round trip preserves content and names', async () => {
  const dir = makeTempDir()
  const zipPath = path.join(dir, 'sample.zip')

  const zip = new AdmZip()
  zip.addFile('report.pdf', Buffer.from('fake pdf content'))
  zip.addFile('notes/todo.txt', Buffer.from('buy milk'))
  zip.writeZip(zipPath)

  let generatedKey = null
  const encryptedPath = await zipHandler.encryptZip(zipPath, {
    rawKey: true,
    onKeyGenerated: (key) => { generatedKey = key }
  })

  const decryptedPath = await zipHandler.decryptZip(encryptedPath, { rawKey: generatedKey })
  const result = new AdmZip(decryptedPath)
  const entries = result.getEntries()

  const reportEntry = entries.find((e) => e.entryName === 'report.pdf')
  const notesEntry = entries.find((e) => e.entryName === 'notes/todo.txt')

  assert.ok(reportEntry, 'report.pdf entry should exist')
  assert.ok(notesEntry, 'notes/todo.txt entry should exist')
  assert.strictEqual(reportEntry.getData().toString(), 'fake pdf content')
  assert.strictEqual(notesEntry.getData().toString(), 'buy milk')
})

test('zip encrypt uses one shared key across all entries', async () => {
  const dir = makeTempDir()
  const zipPath = path.join(dir, 'sample.zip')

  const zip = new AdmZip()
  zip.addFile('a.txt', Buffer.from('content a'))
  zip.addFile('b.txt', Buffer.from('content b'))
  zip.addFile('c.txt', Buffer.from('content c'))
  zip.writeZip(zipPath)

  let generatedKey = null
  const encryptedPath = await zipHandler.encryptZip(zipPath, {
    rawKey: true,
    onKeyGenerated: (key) => { generatedKey = key }
  })

  const decryptedPath = await zipHandler.decryptZip(encryptedPath, { rawKey: generatedKey })
  const result = new AdmZip(decryptedPath)
  const entries = result.getEntries()

  assert.strictEqual(entries.length, 3)
  assert.strictEqual(entries.find((e) => e.entryName === 'a.txt').getData().toString(), 'content a')
  assert.strictEqual(entries.find((e) => e.entryName === 'b.txt').getData().toString(), 'content b')
  assert.strictEqual(entries.find((e) => e.entryName === 'c.txt').getData().toString(), 'content c')
})

test('zip hideNames mode hides filenames and restores them on decrypt', async () => {
  const dir = makeTempDir()
  const zipPath = path.join(dir, 'sample.zip')

  const zip = new AdmZip()
  zip.addFile('secret-plan.txt', Buffer.from('the secret plan'))
  zip.writeZip(zipPath)

  let generatedKey = null
  const encryptedPath = await zipHandler.encryptZip(zipPath, {
    rawKey: true,
    hideNames: true,
    onKeyGenerated: (key) => { generatedKey = key }
  })

  const encryptedZip = new AdmZip(encryptedPath)
  const encryptedEntries = encryptedZip.getEntries()
  assert.strictEqual(encryptedEntries.length, 1)
  assert.notStrictEqual(encryptedEntries[0].entryName, 'secret-plan.txt.fkob')

  const decryptedPath = await zipHandler.decryptZip(encryptedPath, { rawKey: generatedKey })
  const result = new AdmZip(decryptedPath)
  const entries = result.getEntries()

  assert.strictEqual(entries[0].entryName, 'secret-plan.txt')
  assert.strictEqual(entries[0].getData().toString(), 'the secret plan')
})

test('zip decrypt fails with wrong key', async () => {
  const dir = makeTempDir()
  const zipPath = path.join(dir, 'sample.zip')

  const zip = new AdmZip()
  zip.addFile('data.txt', Buffer.from('protected'))
  zip.writeZip(zipPath)

  const encryptedPath = await zipHandler.encryptZip(zipPath, { rawKey: true })

  await assert.rejects(
    zipHandler.decryptZip(encryptedPath, { rawKey: Buffer.alloc(32, 1) })
  )
})

test('archive walkDirectory finds all files recursively', () => {
  const dir = makeTempDir()
  fs.mkdirSync(path.join(dir, 'sub'))
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a')
  fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'b')

  const files = archive.walkDirectory(dir)
  assert.strictEqual(files.length, 2)
})

test('archive toEncryptedPath and toDecryptedPath are inverses', () => {
  const original = '/some/path/file.txt'
  const encrypted = archive.toEncryptedPath(original)
  assert.strictEqual(encrypted, '/some/path/file.txt.fkob')
  const decrypted = archive.toDecryptedPath(encrypted)
  assert.strictEqual(decrypted, original)
})

test('archive collectTargetsForEncrypt skips already encrypted files', () => {
  const dir = makeTempDir()
  fs.writeFileSync(path.join(dir, 'plain.txt'), 'plain')
  fs.writeFileSync(path.join(dir, 'already.txt.fkob'), 'encrypted')

  const targets = archive.collectTargetsForEncrypt(dir)
  assert.strictEqual(targets.length, 1)
  assert.ok(targets[0].endsWith('plain.txt'))
})

test('archive collectTargetsForDecrypt only includes fkob files', () => {
  const dir = makeTempDir()
  fs.writeFileSync(path.join(dir, 'plain.txt'), 'plain')
  fs.writeFileSync(path.join(dir, 'encrypted.txt.fkob'), 'encrypted')

  const targets = archive.collectTargetsForDecrypt(dir)
  assert.strictEqual(targets.length, 1)
  assert.ok(targets[0].endsWith('encrypted.txt.fkob'))
})
