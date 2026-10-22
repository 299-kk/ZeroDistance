import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DISCLAIMER } from '../../shared/consent'

export const disclaimerHash = crypto.createHash('sha256').update(JSON.stringify(DISCLAIMER)).digest('hex')
export function hasAcceptedDisclaimer(file: string): boolean {
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024) return false
    const record = JSON.parse(fs.readFileSync(file, 'utf8'))
    return record.version === DISCLAIMER.version && record.contentHash === disclaimerHash &&
      typeof record.acceptedAt === 'string' && Number.isFinite(Date.parse(record.acceptedAt)) && typeof record.appVersion === 'string'
  } catch { return false }
}
export function saveDisclaimerAcceptance(file: string, appVersion: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: DISCLAIMER.version, contentHash: disclaimerHash, acceptedAt: new Date().toISOString(), appVersion }, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, file)
  } finally { fs.rmSync(temporary, { force: true }) }
}
