# Changelog

All notable changes to this project are documented here.

Format follows Keep a Changelog. This project uses semantic versioning: major.minor.patch.

## [1.0.0]

Initial release.

### Added

- AES-256-GCM encryption and decryption for individual files, whole folders, and zip archives.
- Two independent unlock methods per encrypted item: an auto-generated 64 character key, a user set password, or both at once. Either one alone is enough to decrypt.
- Argon2id key derivation for password mode, run through hash-wasm with no native compilation required.
- In-place encryption: folders and zips keep their structure and filenames, each file is encrypted individually rather than bundled into one archive.
- Optional filename hiding for zip entries, renamed to index based names with the real name stored encrypted inside the payload.
- Self-contained file headers: every encrypted file carries its own wrapped key material, so no external manifest is required and no single lost file can strand an entire batch.
- Tamper detection via GCM authentication tags. Wrong key, wrong password, and corrupted files all fail loudly rather than producing silently broken output.
- JavaScript obfuscation mode using javascript-obfuscator, with light, medium, and heavy presets. Output remains directly runnable, no key or password involved.
- Advanced flag overrides for individual obfuscation settings: identifier renaming, control flow flattening, dead code injection, string encryption, self defending code, debug protection, console disabling, and compaction.
- Full CLI: encrypt, decrypt, obfuscate, verify, and gui commands.
- Non interactive decrypt and encrypt support via environment variables, for use in CI and deploy pipelines.
- Local web GUI served from a plain Node http server, no external framework, with drag and drop, native folder picking, and a key reveal flow that requires explicit acknowledgment before continuing.
- Automated test suite covering encrypt and decrypt round trips, wrong key and wrong password rejection, tamper detection, dual unlock behavior, zip filename hiding, and all three obfuscation presets.
- GitHub Actions workflow to run the test suite on every push and pull request to main.
- GitHub Actions workflow to publish to npm on a version tag push or manual dispatch, including automatic version bump and commit when the dispatched version differs from package.json.
- GPL-3.0 license.
