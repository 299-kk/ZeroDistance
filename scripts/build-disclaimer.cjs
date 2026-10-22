const fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '..'), notice = require('../src/shared/disclaimer.json')
const sections = notice.sections.map(section => `## ${section.title}\n\n${section.text}`).join('\n\n')
const markdown = `# ZeroDistance ${notice.title}\n\n声明版本：${notice.version}\n\n${notice.introduction}\n\n${sections}\n`
fs.mkdirSync(path.join(root, 'build'), { recursive: true })
fs.writeFileSync(path.join(root, 'docs/DISCLAIMER.md'), markdown)
fs.writeFileSync(path.join(root, 'build/使用声明.txt'), markdown.replace(/^#+ /gm, '').replace(/\n/g, '\r\n'), 'utf8')
fs.writeFileSync(path.join(root, 'build/README-Windows.txt'), `ZeroDistance ${require('../package.json').version} · Windows x64\r\n\r\nZIP 版：先完整解压，再运行 ZeroDistance.exe。请保留其余文件和文件夹。\r\n安装版：运行 Setup.exe，按向导选择安装目录；通过开始菜单或桌面快捷方式启动。\r\n首次使用需阅读并同意使用声明，按钮显示满 3 秒后才能点击；不同意会退出。\r\n声明、账号、设置和日志默认保存在 %APPDATA%\\ZeroDistance。\r\n游戏默认安装至 D:\\ZeroDistance\\.minecraft，D 盘不可用时使用本机后备目录。\r\n卸载程序保留账号设置、同意记录及游戏文件，不自动删除这些数据。\r\n软件及第三方许可见 LICENSE、THIRD_PARTY_NOTICES.md、licenses 与 docs 文件夹。\r\n`)
console.log('Usage disclaimer and Windows readme generated.')
