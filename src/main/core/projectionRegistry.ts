import fs from 'node:fs'
import path from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
// Share one compressed snapshot between the main process and worker bundles.
// The uncompressed source remains readable for development and data audits.
type Snapshot={registry:Record<string,string>;schemas:Record<string,unknown>;legacy:Record<string,string>;supported:Array<{version:string;dataVersion:number}>}
const packed=path.join(__dirname,'projection-registries.json.br')
const snapshot=JSON.parse(fs.existsSync(packed)?brotliDecompressSync(fs.readFileSync(packed)).toString('utf8'):fs.readFileSync(path.join(__dirname,'projectionRegistries.json'),'utf8')) as Snapshot
export function minecraftData(version:string):any{const hash=(snapshot.registry as Record<string,string>)[version];if(!hash)return undefined;return {blocksByName:(snapshot.schemas as Record<string,unknown>)[hash],blocksArray:true}}
export namespace minecraftData { export const legacy={pc:{blocks:snapshot.legacy}};export const versions={pc:snapshot.supported.map(v=>({minecraftVersion:v.version,dataVersion:v.dataVersion,releaseType:'release'}))} }
