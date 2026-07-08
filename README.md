# fkobf

Self-hosted local file encryption and code obfuscation tool. Clone it, run it on your own device, nothing leaves your machine.

![Tests](https://github.com/Firekid-is-him/fkob/actions/workflows/test.yml/badge.svg)
![npm version](https://img.shields.io/npm/v/fkobf)
![npm downloads](https://img.shields.io/npm/dt/fkobf)
![GitHub stars](https://img.shields.io/github/stars/Firekid-is-him/fkob)
![last commit](https://img.shields.io/github/last-commit/Firekid-is-him/fkob)

## What it does

fkobf has two independent modes.

**Encrypt / Decrypt**: real AES-256-GCM encryption for files, folders, or zips. Unlock with an auto-generated 64 character key, a password you choose, or both. Either one independently unlocks the file. Lose both and the data is permanently unrecoverable, there is no backdoor and no recovery mechanism.

**Obfuscate**: transforms JavaScript source code so it is difficult to read while still running exactly as before. No key involved, the output is directly executable. This is code hardening, not encryption: it raises the cost of reverse engineering, it does not make it impossible.

## Install

```bash
npm install -g fkobf
```

Or run it directly without installing:

```bash
npx fkobf encrypt ./myfolder
```

## Usage

### Encrypt

```bash
fkobf encrypt ./myfolder
fkobf encrypt ./photos.zip --mode password
fkobf encrypt ./secrets --mode both --hide-names
```

Every file inside a folder or zip is encrypted individually. Folder structure and filenames are preserved by default. For zips, `--hide-names` renames entries to index based names and stores the real filename encrypted inside the payload.

### Decrypt

```bash
fkobf decrypt ./myfolder
fkobf decrypt ./photos.fkob.zip
```

Always prompts interactively for the key or password. There is no flag that accepts a raw key or password on the command line, since that would end up in shell history.

### Obfuscate

```bash
fkobf obfuscate ./src
fkobf obfuscate ./index.js --preset heavy
```

Presets: `light`, `medium`, `heavy`. Heavier presets add control flow flattening, dead code injection, self defending code, and anti debugging measures, at the cost of larger output and slower runtime.

### Non interactive use, for CI and deployment

```bash
fkobf decrypt ./index.js.fkob --password-env FKOBF_SECRET --out ./index.js
```

Reads the secret from an environment variable instead of prompting. Useful for deploy pipelines where you encrypt source before committing it, then decrypt it at build time using a secret only you control.

```json
{
  "scripts": {
    "prestart": "fkobf decrypt index.js.fkob --password-env FKOBF_SECRET --out index.js",
    "start": "node index.js"
  }
}
```

Anyone who forks the repo without the secret gets a build that fails cleanly at the decrypt step. Only deployments where the secret is set can produce working code.

This protects source code at rest, for example on a public GitHub repo. It does not protect code once it is running: whoever controls the runtime environment can always recover the plaintext at that point, since the code has to be decrypted before it can execute. No tool can change that.

### GUI

```bash
fkobf gui
```

Starts a local web server and opens in your browser. Drag and drop files, or use the folder picker to select an entire directory. Same engine as the CLI underneath.

### Verify

```bash
fkobf verify ./somefile.fkob
```

Checks whether a file is a valid fkobf container and which unlock methods it supports, without decrypting it.

## How it works

AES-256-GCM authenticated encryption. A random Data Encryption Key is generated per operation and wrapped independently by whichever unlock methods you choose, either the raw key or an Argon2id derived key from your password. Both wrapped copies, if present, live in the file header, so either one independently unlocks the file.

Every encrypted file is self contained: the full header, including wrapped key material, travels with that file. There is no external manifest that can be lost and strand the rest of a batch.

Wrong key, wrong password, or a tampered file all fail loudly during decryption. GCM's authentication tag check means there is no such thing as silent corruption, only rejection.

The source code is public. This is deliberate. A cryptographic tool being secure only because its implementation is secret is not real security, real security comes from the key being the only secret, ever.

## License

GPL-3.0. See LICENSE.
