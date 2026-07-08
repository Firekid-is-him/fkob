#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { Command } = require('commander')
const prompts = require('prompts')

const cryptoCore = require('../src/crypto-core')
const container = require('../src/container')
const archive = require('../src/archive')
const zipHandler = require('../src/zip-handler')
const obfuscateCore = require('../src/obfuscate-core')

const program = new Command()

program
  .name('fkobf')
  .description('Self-hosted local file encryption and code obfuscation tool')
  .version('1.0.0')

function isZipFile(filePath) {
  return filePath.toLowerCase().endsWith('.zip')
}

function isFkobZipFile(filePath) {
  return filePath.toLowerCase().endsWith('.fkob.zip')
}

async function promptForMode() {
  const response = await prompts({
    type: 'multiselect',
    name: 'modes',
    message: 'Choose unlock method(s)',
    choices: [
      { title: 'Auto-generated key', value: 'key' },
      { title: 'Password', value: 'password' }
    ],
    min: 1
  })
  return response.modes || []
}

async function promptForPassword(message) {
  const response = await prompts({
    type: 'password',
    name: 'password',
    message: message || 'Enter password'
  })
  if (!response.password) {
    throw new Error('Password is required')
  }
  return response.password
}

async function resolveEncryptSecrets(cmdOptions) {
  let modes = []

  if (cmdOptions.mode === 'key') modes = ['key']
  else if (cmdOptions.mode === 'password') modes = ['password']
  else if (cmdOptions.mode === 'both') modes = ['key', 'password']
  else modes = await promptForMode()

  const wantsKey = modes.includes('key')
  const wantsPassword = modes.includes('password')

  let password = null
  if (wantsPassword) {
    if (cmdOptions.passwordEnv) {
      password = process.env[cmdOptions.passwordEnv]
      if (!password) {
        throw new Error(`Environment variable ${cmdOptions.passwordEnv} is not set`)
      }
    } else {
      const first = await promptForPassword('Set a password')
      const confirm = await promptForPassword('Confirm password')
      if (first !== confirm) {
        throw new Error('Passwords do not match')
      }
      password = first
    }
  }

  return {
    rawKey: wantsKey ? true : undefined,
    password: password || undefined
  }
}

async function resolveDecryptSecrets(cmdOptions) {
  let rawKey
  let password

  if (cmdOptions.keyEnv) {
    const value = process.env[cmdOptions.keyEnv]
    if (!value) {
      throw new Error(`Environment variable ${cmdOptions.keyEnv} is not set`)
    }
    rawKey = cryptoCore.hexToRawKey(value)
  }

  if (cmdOptions.passwordEnv) {
    const value = process.env[cmdOptions.passwordEnv]
    if (!value) {
      throw new Error(`Environment variable ${cmdOptions.passwordEnv} is not set`)
    }
    password = value
  }

  if (!rawKey && !password) {
    const response = await prompts({
      type: 'select',
      name: 'method',
      message: 'How do you want to unlock this file?',
      choices: [
        { title: 'I have the key', value: 'key' },
        { title: 'I have the password', value: 'password' }
      ]
    })

    if (response.method === 'key') {
      const keyResponse = await prompts({
        type: 'text',
        name: 'key',
        message: 'Enter the 64 character key'
      })
      rawKey = cryptoCore.hexToRawKey(keyResponse.key || '')
    } else if (response.method === 'password') {
      password = await promptForPassword('Enter password')
    } else {
      throw new Error('No unlock method selected')
    }
  }

  return { rawKey, password }
}

program
  .command('encrypt <path>')
  .description('Encrypt a file, folder, or zip')
  .option('--mode <mode>', 'key, password, or both')
  .option('--password-env <var>', 'read password from an environment variable, non interactive')
  .option('--hide-names', 'for zips, hide original filenames inside the archive')
  .option('--delete-original', 'remove the original file after successful encryption')
  .option('--out <path>', 'custom output path')
  .action(async (inputPath, cmdOptions) => {
    try {
      const resolvedPath = path.resolve(inputPath)
      if (!fs.existsSync(resolvedPath)) {
        console.error(`Path does not exist: ${inputPath}`)
        process.exitCode = 1
        return
      }

      const secrets = await resolveEncryptSecrets(cmdOptions)
      let generatedRawKey = null

      if (isZipFile(resolvedPath)) {
        const outputPath = await zipHandler.encryptZip(resolvedPath, {
          rawKey: secrets.rawKey,
          password: secrets.password,
          hideNames: Boolean(cmdOptions.hideNames),
          onKeyGenerated: (key) => { generatedRawKey = key }
        })
        console.log(`Encrypted: ${outputPath}`)
      } else {
        const targets = archive.collectTargetsForEncrypt(resolvedPath)
        let sharedRawKey = secrets.rawKey === true ? cryptoCore.generateRawKey() : secrets.rawKey

        for (const targetPath of targets) {
          const plaintext = fs.readFileSync(targetPath)
          const result = await cryptoCore.encryptBuffer(plaintext, {
            rawKey: sharedRawKey,
            password: secrets.password
          })
          const outputPath = archive.toEncryptedPath(targetPath)
          fs.writeFileSync(outputPath, result.output)
        }

        if (secrets.rawKey === true) {
          generatedRawKey = sharedRawKey
        }

        if (cmdOptions.deleteOriginal) {
          for (const targetPath of targets) {
            fs.unlinkSync(targetPath)
          }
        }

        console.log(`Encrypted ${targets.length} file(s) in ${inputPath}`)
      }

      if (generatedRawKey) {
        console.log('')
        console.log('Save this key. It is the only way to recover your data if you did not also set a password.')
        console.log('This key will not be shown again.')
        console.log('')
        console.log(cryptoCore.rawKeyToHex(generatedRawKey))
        console.log('')
      }
    } catch (error) {
      console.error(`Error: ${error.message}`)
      process.exitCode = 1
    }
  })

program
  .command('decrypt <path>')
  .description('Decrypt a file, folder, or zip')
  .option('--key-env <var>', 'read the key from an environment variable, non interactive')
  .option('--password-env <var>', 'read the password from an environment variable, non interactive')
  .option('--out <path>', 'custom output path')
  .action(async (inputPath, cmdOptions) => {
    try {
      const resolvedPath = path.resolve(inputPath)
      if (!fs.existsSync(resolvedPath)) {
        console.error(`Path does not exist: ${inputPath}`)
        process.exitCode = 1
        return
      }

      const secrets = await resolveDecryptSecrets(cmdOptions)

      if (isFkobZipFile(resolvedPath)) {
        const outputPath = await zipHandler.decryptZip(resolvedPath, secrets)
        console.log(`Decrypted: ${outputPath}`)
      } else {
        const targets = archive.collectTargetsForDecrypt(resolvedPath)

        for (const targetPath of targets) {
          const fileBuffer = fs.readFileSync(targetPath)
          const plaintext = await cryptoCore.decryptBuffer(fileBuffer, secrets)
          const outputPath = archive.toDecryptedPath(targetPath)
          fs.writeFileSync(outputPath, plaintext)
        }

        console.log(`Decrypted ${targets.length} file(s) in ${inputPath}`)
      }
    } catch (error) {
      console.error(`Error: ${error.message}`)
      process.exitCode = 1
    }
  })

program
  .command('obfuscate <path>')
  .description('Obfuscate JavaScript source code, output still runs directly')
  .option('--preset <preset>', 'light, medium, or heavy', 'medium')
  .option('--out <path>', 'custom output path')
  .action(async (inputPath, cmdOptions) => {
    try {
      const resolvedPath = path.resolve(inputPath)
      if (!fs.existsSync(resolvedPath)) {
        console.error(`Path does not exist: ${inputPath}`)
        process.exitCode = 1
        return
      }

      const stat = fs.statSync(resolvedPath)
      const jsFiles = stat.isDirectory()
        ? archive.walkDirectory(resolvedPath).filter((filePath) => filePath.endsWith('.js'))
        : [resolvedPath]

      for (const filePath of jsFiles) {
        const outputPath = cmdOptions.out && jsFiles.length === 1 ? cmdOptions.out : filePath
        obfuscateCore.obfuscateFile(filePath, outputPath, cmdOptions.preset)
      }

      console.log(`Obfuscated ${jsFiles.length} file(s) using the ${cmdOptions.preset} preset`)
    } catch (error) {
      console.error(`Error: ${error.message}`)
      process.exitCode = 1
    }
  })

program
  .command('verify <path>')
  .description('Check if a file is a valid fkobf encrypted file without decrypting it')
  .action((inputPath) => {
    try {
      const resolvedPath = path.resolve(inputPath)
      const fileBuffer = fs.readFileSync(resolvedPath)
      const valid = container.isValidContainer(fileBuffer)

      if (!valid) {
        console.log('Not a valid fkobf file')
        return
      }

      const parsed = container.parseHeader(fileBuffer)
      console.log('Valid fkobf file')
      console.log(`Version: ${parsed.version}`)
      console.log(`Key unlock available: ${parsed.hasKeySlot}`)
      console.log(`Password unlock available: ${parsed.hasPasswordSlot}`)
    } catch (error) {
      console.error(`Error: ${error.message}`)
      process.exitCode = 1
    }
  })

program
  .command('gui')
  .description('Start the local web GUI')
  .option('--port <number>', 'port to run on', '7331')
  .action((cmdOptions) => {
    process.env.FKOBF_GUI_PORT = cmdOptions.port
    require('../gui/server')
  })

program.parseAsync(process.argv)
