import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ConsentReadingGate, DISCLAIMER } from '../src/shared/consent'
import { disclaimerHash, hasAcceptedDisclaimer, saveDisclaimerAcceptance } from '../src/main/core/consentStore'

test('consent requires three seconds after content presentation and cannot accept at 2999ms', () => {
  const gate = new ConsentReadingGate()
  assert.equal(gate.state(5000, true).canAccept, false)
  gate.present(5000, true)
  assert.equal(gate.state(7999, true).remainingMs, 1)
  assert.equal(gate.state(7999, true).canAccept, false)
  assert.equal(gate.state(8000, true).canAccept, true)
})
test('hidden and unfocused time never counts toward reading, and reloading resets it', () => {
  const gate = new ConsentReadingGate()
  gate.present(0, true); gate.update(1000, false)
  assert.equal(gate.state(20000, false).remainingMs, 2000)
  gate.update(20000, true)
  assert.equal(gate.state(21999, true).canAccept, false)
  assert.equal(gate.state(22000, true).canAccept, true)
  gate.reset(); gate.present(23000, true)
  assert.equal(gate.state(23000, true).remainingMs, 3000)
})
test('repeated ready requests cannot reset or accelerate the monotonic gate', () => {
  const gate = new ConsentReadingGate()
  gate.present(100, true); gate.present(1000, true)
  assert.equal(gate.state(2000, true).remainingMs, 1100)
  assert.equal(gate.state(3099, true).canAccept, false)
  assert.equal(gate.state(3100, true).canAccept, true)
})
test('acceptance survives app version changes but rejects missing, corrupt or changed terms', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-consent-'))
  t.after(() => { assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(dir, { recursive: true, force: true }) })
  const file = path.join(dir, 'consent.json')
  assert.equal(hasAcceptedDisclaimer(file), false)
  saveDisclaimerAcceptance(file, '0.1.4')
  assert.equal(hasAcceptedDisclaimer(file), true)
  const original = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(original).sort(), ['acceptedAt', 'appVersion', 'contentHash', 'version'])
  assert.equal(original.contentHash, disclaimerHash)
  for (const patch of [{ appVersion: '0.1.5' }, { version: 'old' }, { contentHash: '0'.repeat(64) }, { acceptedAt: 'bad' }]) {
    fs.writeFileSync(file, JSON.stringify({ ...original, ...patch }))
    assert.equal(hasAcceptedDisclaimer(file), 'appVersion' in patch)
  }
  fs.writeFileSync(file, '{invalid'); assert.equal(hasAcceptedDisclaimer(file), false)
  assert.equal(fs.readdirSync(dir).filter(name => name.endsWith('.tmp')).length, 0)
  assert(DISCLAIMER.sections.some(section => section.important && section.text.includes('依法不得免除')))
})
