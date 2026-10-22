const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),Zip=require('adm-zip')
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'..'),out=path.join(project,'out'),release=path.join(project,'release'),cache=path.join(root,'.qa/migration-tools'),version=require('../package.json').version,product='ZeroDistance-'+version
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),nsis=value=>value.replace(/\$/g,()=> '$$').replace(/"/g,()=> '$\\"')
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink());const f=path.join(dir,e.name);return e.isDirectory()?files(f):[f]})}
function compiler(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isFile()&&e.name==='makensis.exe')return f;if(e.isDirectory()){const found=compiler(f);if(found)return found}}}
function run(){
 const build=JSON.parse(fs.readFileSync(path.join(out,'BUILD.json')));assert.equal(build.version,version);assert.equal(build.bundlesElectron,false)
 const zipFile=path.join(release,product+'-windows-x64.zip'),installer=path.join(release,product+'-Setup.exe')
 fs.mkdirSync(release,{recursive:true});fs.writeFileSync(path.join(out,'ZeroDistance.Native.marker'),'app.zerodistance.native/0.3')
 const entries=files(out).map(file=>({file,name:path.relative(out,file).replaceAll('\\','/'),bytes:fs.readFileSync(file)})).sort((a,b)=>a.name.localeCompare(b.name))
 assert(!entries.some(e=>/(electron|msedgewebview2|chrome)\.exe$/i.test(e.name)));assert.equal(hash(entries.find(e=>e.name==='engine/node.exe').bytes),require('../dependencies.lock.json').node.sha256)
 for(const photo of require('../../src/shared/landscape-images.json')){const id=path.basename(photo.file,'.webp'),item=entries.find(e=>e.name.startsWith('ui/assets/'+id+'-'));if(!item&&photo.optional){console.log('Optional local photograph not bundled: '+photo.title);continue}assert(item&&hash(item.bytes)===photo.sha256,'Original photo mismatch: '+id)}
 if(!process.argv.includes('--source-only')){
 const zip=new Zip();for(const e of entries){zip.addFile(e.name,e.bytes);zip.getEntry(e.name).header.time=new Date('2020-01-01T00:00:00Z')}zip.writeZip(zipFile)
 const script=`Unicode true
!include "MUI2.nsh"
!include "Sections.nsh"
!include "FileFunc.nsh"
!define ZD_REG_ROOT "Software\\ZeroDistance"
!define ZD_INSTALL_KEY "\${ZD_REG_ROOT}\\Native"
!define ZD_UNINSTALL_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZeroDistanceNative"
!define ZD_DATA_DIR "$APPDATA\\ZeroDistance-Native"
!define ZD_LOCAL_DATA_DIR "$LOCALAPPDATA\\ZeroDistance-Native"
!define ZD_CLEANUP_ARGS ""
!define ZD_SHORTCUT "ZeroDistance.lnk"
!define ZD_LEGACY_SHORTCUT "ZeroDistance 原生迁移版.lnk"
Name "ZeroDistance"
OutFile "${nsis(installer)}"
InstallDir "$LOCALAPPDATA\\Programs\\ZeroDistance-Native"
InstallDirRegKey HKCU "\${ZD_INSTALL_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "ZeroDistance · Preview Testing"
Icon "${nsis(path.join(cache,'native.ico'))}"
UninstallIcon "${nsis(path.join(cache,'native.ico'))}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "ZeroDistance 预览测试版"
!define MUI_WELCOMEPAGE_TEXT "${version} 从 2026 年 10 月 22 日开始预览测试。更新历史及测试说明见程序中的更新记录和安装目录 CHANGELOG.md。$\\r$\\n$\\r$\\n需要 .NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。此版本与 0.2.2 独立安装、独立保存配置。"
!insertmacro MUI_PAGE_WELCOME
!define MUI_COMPONENTSPAGE_TEXT_TOP "选择是否创建桌面快捷方式。默认已勾选，不需要时可以取消。"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!define MUI_UNCONFIRMPAGE_TEXT_TOP "卸载会清除此版本的账号、设置、日志、临时文件及浏览器缓存，并移除快捷方式和安装信息。Minecraft 游戏目录、模组和存档会保留。请先关闭 ZeroDistance。"
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Section "ZeroDistance 主程序（必需）" SEC_APP
  SectionIn RO
  SetRegView 64
  SetShellVarContext current
  IfFileExists "$INSTDIR\\ZeroDistance.Native.marker" 0 check_files
  FileOpen $0 "$INSTDIR\\ZeroDistance.Native.marker" r
  FileRead $0 $1
  FileClose $0
  StrCmp $1 "app.zerodistance.native/0.3" install_files
check_files:
  FindFirst $0 $1 "$INSTDIR\\*"
check_existing:
  StrCmp $1 "" existing_done
  StrCmp $1 "." existing_next
  StrCmp $1 ".." existing_next
  FindClose $0
  MessageBox MB_ICONSTOP "此文件夹包含其他文件。请选择新的空文件夹，避免覆盖原启动器或个人文件。" /SD IDOK
  SetErrorLevel 2
  Abort
existing_next:
  FindNext $0 $1
  Goto check_existing
existing_done:
  FindClose $0
install_files:
  SetOutPath "$INSTDIR"
  File /r "${nsis(path.join(out,'*'))}"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  WriteRegStr HKCU "\${ZD_INSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "\${ZD_UNINSTALL_KEY}" "DisplayName" "ZeroDistance"
  WriteRegStr HKCU "\${ZD_UNINSTALL_KEY}" "DisplayVersion" "${version}"
  WriteRegStr HKCU "\${ZD_UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "\${ZD_UNINSTALL_KEY}" "UninstallString" '$\\"$INSTDIR\\Uninstall.exe$\\"'
  WriteRegStr HKCU "\${ZD_UNINSTALL_KEY}" "QuietUninstallString" '$\\"$INSTDIR\\Uninstall.exe$\\" /S'
  WriteRegStr HKCU "\${ZD_UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\\ZeroDistance.exe"
  WriteRegDWORD HKCU "\${ZD_UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "\${ZD_UNINSTALL_KEY}" "NoRepair" 1
  Delete "$SMPROGRAMS\\\${ZD_LEGACY_SHORTCUT}"
  Delete "$DESKTOP\\\${ZD_LEGACY_SHORTCUT}"
  CreateShortcut "$SMPROGRAMS\\\${ZD_SHORTCUT}" "$INSTDIR\\ZeroDistance.exe"
SectionEnd
Section "创建桌面快捷方式" SEC_DESKTOP
  SetShellVarContext current
  CreateShortcut "$DESKTOP\\\${ZD_SHORTCUT}" "$INSTDIR\\ZeroDistance.exe"
SectionEnd
Function .onInit
  \${GetParameters} $0
  ClearErrors
  \${GetOptions} $0 "/NoDesktopShortcut" $1
  IfErrors desktop_default
  !insertmacro UnselectSection \${SEC_DESKTOP}
desktop_default:
FunctionEnd
Function un.NoteOtherInstallation
  StrCmp $0 "" other_done
  StrCmp $0 $INSTDIR other_done
  IfFileExists "$0\\ZeroDistance.exe" other_found
  IfFileExists "$0\\ZeroDistance.Native.marker" other_found other_done
other_found:
  StrCpy $4 "--keep-data"
other_done:
FunctionEnd
Section "Uninstall"
  SetShellVarContext current
  ; Keep the current installation's shared data if an older copy is removed.
  StrCpy $4 ""
  SetRegView 64
  ReadRegStr $0 HKCU "\${ZD_INSTALL_KEY}" "InstallLocation"
  Call un.NoteOtherInstallation
  ReadRegStr $0 HKCU "\${ZD_UNINSTALL_KEY}" "InstallLocation"
  Call un.NoteOtherInstallation
  SetRegView 32
  ReadRegStr $0 HKCU "\${ZD_INSTALL_KEY}" "InstallLocation"
  Call un.NoteOtherInstallation
  ReadRegStr $0 HKCU "\${ZD_UNINSTALL_KEY}" "InstallLocation"
  Call un.NoteOtherInstallation
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  ClearErrors
  CopyFiles /SILENT "$INSTDIR\\UninstallCleanup.exe" "$PLUGINSDIR\\UninstallCleanup.exe"
  IfErrors cleanup_missing
  nsExec::ExecToStack '\"$PLUGINSDIR\\UninstallCleanup.exe\" --install-dir \"$INSTDIR\" --data-dir \"\${ZD_DATA_DIR}\" --local-data-dir \"\${ZD_LOCAL_DATA_DIR}\" \${ZD_CLEANUP_ARGS} $4'
  Pop $0
  Pop $1
!ifdef ZD_TEST_LOG
  FileOpen $2 "\${ZD_TEST_LOG}" a
  FileWrite $2 "$0: $1$\\r$\\n"
  FileClose $2
!endif
  DetailPrint "$1"
  StrCmp $0 "0" cleanup_success
  MessageBox MB_ICONSTOP "$1$\\r$\\n$\\r$\\n清理尚未完成，卸载记录已保留。请关闭相关程序后重新运行卸载。" /SD IDOK
  SetErrorLevel 1
  Abort
cleanup_missing:
  MessageBox MB_ICONSTOP "卸载清理组件缺失。请使用最新安装程序修复此安装后再卸载。" /SD IDOK
  SetErrorLevel 1
  Abort
cleanup_success:
  StrCmp $4 "" 0 remove_uninstaller
  SetRegView 64
  DeleteRegKey HKCU "\${ZD_INSTALL_KEY}"
  DeleteRegKey HKCU "\${ZD_UNINSTALL_KEY}"
  DeleteRegKey /ifempty HKCU "\${ZD_REG_ROOT}"
  SetRegView 32
  DeleteRegKey HKCU "\${ZD_INSTALL_KEY}"
  DeleteRegKey HKCU "\${ZD_UNINSTALL_KEY}"
  DeleteRegKey /ifempty HKCU "\${ZD_REG_ROOT}"
  Delete "$SMPROGRAMS\\\${ZD_SHORTCUT}"
  Delete "$DESKTOP\\\${ZD_SHORTCUT}"
  Delete "$SMPROGRAMS\\\${ZD_LEGACY_SHORTCUT}"
  Delete "$DESKTOP\\\${ZD_LEGACY_SHORTCUT}"
remove_uninstaller:
  Delete "$INSTDIR\\.uninstall-preserved-games.json"
  Delete "$INSTDIR\\UninstallCleanup.exe"
  Delete "$INSTDIR\\ZeroDistance.Native.marker"
  Delete "$INSTDIR\\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
`
 const makensis=process.env.ZERO_DISTANCE_MAKENSIS||compiler(path.join(process.env.LOCALAPPDATA,'electron-builder/Cache/nsis-3.0.4.1'));assert(makensis,'Set ZERO_DISTANCE_MAKENSIS to NSIS 3 makensis.exe')
 const nsi=path.join(cache,'native-launcher.nsi');fs.writeFileSync(nsi,'\ufeff'+script);execFileSync(makensis,['/V2',nsi],{stdio:'inherit',windowsHide:true,timeout:180000})
 }
 const publicImages=new Set(require('../../src/shared/landscape-images.json').filter(image=>image.generated===true).map(image=>'src/renderer/src/assets/launch/'+image.file))
 const expectedPrefixes=[...publicImages].map(file=>'ui/assets/'+path.basename(file,'.webp')+'-')
 assert(!entries.some(e=>e.name.startsWith('ui/assets/landscape-')&&!expectedPrefixes.some(prefix=>e.name.startsWith(prefix))),'Unlisted background must not enter the release')
 const source=new Zip(),exclude=new Set(['node_modules','.qa','.git','.cache','out','release','素材','migration-proof'])
 const allowed=name=>(!name.startsWith('src/renderer/src/assets/launch/')||publicImages.has(name))&&!name.startsWith('docs/screenshots/')&&!/^docs\/validation-1\.1\.7\/.*\.(png|wav|webm)$/.test(name)&&!/^bridge\/(build|dist)\//.test(name)&&!/(^|\/)(accounts|settings|consent|window)\.json$|(^|\/)\.env(?:\.|$)|\.(exe|dll|jar|zip|7z|arw|pem|key|pfx|p12|log)$/i.test(name)
 function add(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(exclude.has(e.name)||e.isSymbolicLink())continue;const file=path.join(dir,e.name),name=path.relative(root,file).replaceAll('\\','/');if(e.isDirectory())add(file);else if(allowed(name))source.addFile(name,fs.readFileSync(file))}}
 for(const dir of ['.github','src','scripts','tests','build','licenses','docs','lan-agent','bridge','native','native-launcher'])if(fs.existsSync(path.join(root,dir)))add(path.join(root,dir))
 for(const name of ['README.md','START_HERE.md','CURRENT_STATUS.md','FEATURE_AUDIT.md','CONTRIBUTING.md','SECURITY.md','.gitignore','LICENSE','THIRD_PARTY_NOTICES.md','AGENTS.md','package.json','package-lock.json','electron.vite.config.ts','tsconfig.json'])if(fs.existsSync(path.join(root,name)))source.addFile(name,fs.readFileSync(path.join(root,name)))
 source.addFile('README-SOURCE.txt',Buffer.from('ZeroDistance 对应源码。请先阅读 README.md 和 docs/DEVELOPMENT.md。运行 npm ci 与 npm run build:native。系统 WebView2 提供浏览器运行时，业务后端仍包含 Node.js 兼容引擎。包含四张 AI 生成背景及生成提示记录，保留 KAMUCL 与第三方许可。\n'))
 const sourceFile=path.join(release,product+'-source.zip');source.writeZip(sourceFile)
 const artifacts=[installer,zipFile,sourceFile].map(file=>({name:path.basename(file),bytes:fs.statSync(file).size,sha256:hash(fs.readFileSync(file))}));assert(artifacts.filter(a=>!a.name.endsWith('-source.zip')).every(a=>a.bytes<100000000),'Keep both distributions below 100 MB')
 const report={version,files:entries.length,installedBytes:entries.reduce((s,e)=>s+e.bytes.length,0),artifacts,bundlesElectron:false,bundlesChromium:false,bundlesNode:true,requiresSystemWebView2:true,pureCSharpBackend:false}
 fs.writeFileSync(path.join(release,'SIZE.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(release,'SHA256SUMS.txt'),artifacts.map(a=>a.sha256+'  '+a.name).join('\n')+'\n');console.log(JSON.stringify(report,null,2))
}
try{run()}catch(error){console.error(error);process.exitCode=1}
