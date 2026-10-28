import fs from 'node:fs'
import path from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
// Share one compressed snapshot between the main process and worker bundles.
// The uncompressed source remains readable for development and data audits.
type Snapshot={registry:Record<string,string>;schemas:Record<string,unknown>;legacy:Record<string,string>;supported:Array<{version:string;dataVersion:number}>}
const packed=path.join(__dirname,'projection-registries.json.br')
let snapshot:Snapshot|undefined
function load():Snapshot{return snapshot??=JSON.parse(fs.existsSync(packed)?brotliDecompressSync(fs.readFileSync(packed)).toString('utf8'):fs.readFileSync(path.join(__dirname,'projectionRegistries.json'),'utf8')) as Snapshot}
export function releaseProjectionRegistry():void{snapshot=undefined}
export function minecraftData(version:string):any{const data=load(),hash=data.registry[version];if(!hash)return undefined;return {blocksByName:data.schemas[hash],blocksArray:true}}
export namespace minecraftData { export const legacy={pc:{get blocks(){return load().legacy}}};export const versions={get pc(){return load().supported.map(v=>({minecraftVersion:v.version,dataVersion:v.dataVersion,releaseType:'release'}))}} }
