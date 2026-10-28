using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Runtime.InteropServices;

internal static class UpdateHelper {
    static readonly HashSet<string> RootFiles=new HashSet<string>(StringComparer.OrdinalIgnoreCase){"ZeroDistance.exe","UpdateHelper.exe","UninstallCleanup.exe","ZeroDistance.Native.marker","BUILD.json","PACKAGE_FILES.json","LICENSE","THIRD_PARTY_NOTICES.md","Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll","WebView2Loader.dll","README.txt","CHANGELOG.md","NOTICE.md","MIGRATION_STATUS.md","RESULT.md"};
    static string updates,target,job,stage,backup;static readonly List<string> touched=new List<string>();static bool qa,noRestart;
    static FileStream lease;
    static string In(string relative,string dir){return UpdatePackage.Under(Path.Combine(dir,relative.Replace('/',Path.DirectorySeparatorChar)),dir);}
    static bool Allowed(string name){string normalized=name.Replace('\\','/');return normalized.Split('/').All(p=>p.Length>0&&p!=".."&&p!="."&&!p.EndsWith(".")&&!p.EndsWith(" ")&&!p.Any(c=>c<32||"<>:\"|?*".IndexOf(c)>=0)&&!System.Text.RegularExpressions.Regex.IsMatch(p.Split('.')[0],@"^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$",System.Text.RegularExpressions.RegexOptions.IgnoreCase))&&(RootFiles.Contains(normalized)||new[]{"engine/","ui/","startup/","licenses/","legal/"}.Any(prefix=>normalized.StartsWith(prefix,StringComparison.Ordinal)));}
    static void CopyEntry(Stream input,Stream output,long length){byte[] buffer=new byte[65536];long copied=0;int read;while((read=input.Read(buffer,0,buffer.Length))>0){copied+=read;if(copied>length)throw new Exception("解压数据超出声明长度");output.Write(buffer,0,read);}if(copied!=length)throw new Exception("解压数据长度不符");}
    static void Retry(Action action){Exception last=null;for(int n=0;n<40;n++){try{action();return;}catch(IOException e){last=e;Thread.Sleep(250);}}throw last;}
    static void Remember(string name){touched.Add(name);UpdatePackage.Save(Path.Combine(job,"touched.json"),touched.ToArray());}
    static void Restore(){
        string journal=Path.Combine(job,"touched.json");if(!File.Exists(journal))return;
        var names=UpdatePackage.Read(journal) as object[];if(names==null)throw new Exception("恢复记录无效");
        foreach(string name in names.OfType<string>().Reverse()){if(!Allowed(name))throw new Exception("恢复文件路径无效");string old=In(name,backup),dest=In(name,target);Retry(()=>{if(File.Exists(old)){Directory.CreateDirectory(Path.GetDirectoryName(dest));File.Copy(old,dest,true);}else if(File.Exists(dest))File.Delete(dest);});}
        File.Delete(journal);
    }
    static void Install(string planFile,bool recovery){
        job=AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);planFile=UpdatePackage.Under(planFile,job);
        lease=new FileStream(Path.Combine(job,"update.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
        var plan=UpdatePackage.Read(planFile);
        string data=Path.GetFullPath(UpdatePackage.Str(plan,"dataDirectory"));updates=Path.Combine(data,"updates");UpdatePackage.Under(job,updates);UpdatePackage.Plain(data);
        target=Path.GetFullPath(UpdatePackage.Str(plan,"target"));UpdatePackage.Plain(target);if(!File.Exists(Path.Combine(target,"ZeroDistance.exe"))||File.ReadAllText(Path.Combine(target,"ZeroDistance.Native.marker"))!="app.zerodistance.native/0.3")throw new Exception("目标不是已登记的 ZeroDistance 目录");
        string qaKey=null;
        if(qa){if(!target.Split(Path.DirectorySeparatorChar).Contains(".qa")||!data.Split(Path.DirectorySeparatorChar).Contains(".qa"))throw new Exception("测试更新必须在独立 .qa 内");qaKey=File.ReadAllText(UpdatePackage.Under(Path.Combine(job,"qa-key.xml"),job));}
        object payload=UpdatePackage.Verify(UpdatePackage.Get(plan,"envelope"),qaKey),asset=UpdatePackage.Get(payload,"asset");string version=UpdatePackage.Str(payload,"version"),zip=UpdatePackage.Under(UpdatePackage.Str(plan,"file"),updates);
        backup=Path.Combine(job,"backup");UpdatePackage.Plain(backup);
        if(recovery){Restore();UpdatePackage.Save(Path.Combine(updates,"last-result.json"),new{ok=false,recovered=true,error="已恢复中断的更新",backup=backup});return;}
        var installed=UpdatePackage.Read(Path.Combine(target,"BUILD.json"));if(UpdatePackage.Str(installed,"product")!="ZeroDistance"||UpdatePackage.VersionOf(version)<=UpdatePackage.VersionOf(UpdatePackage.Str(installed,"version")))throw new Exception("拒绝安装旧版或重复版本的更新");
        int pid;Int32.TryParse(Convert.ToString(UpdatePackage.Get(plan,"pid")),out pid);if(pid>0){try{using(var old=Process.GetProcessById(pid)){if(!old.WaitForExit(30000))throw new Exception("旧启动器仍在运行");}}catch(ArgumentException){}}
        Restore();stage=Path.Combine(job,"stage-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(stage);Directory.CreateDirectory(backup);var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
        using(var file=UpdatePackage.VerifiedZip(zip,asset))using(var archive=new ZipArchive(file,ZipArchiveMode.Read)){
            if(archive.Entries.Count>4096)throw new Exception("更新包文件过多");
            foreach(var entry in archive.Entries){
                string name=entry.FullName.Replace('\\','/');if(name.EndsWith("/"))continue;
                if(!Allowed(name)||!names.Add(name)||((entry.ExternalAttributes>>16)&0xF000)==0xA000)throw new Exception("更新包包含越界、链接或重复文件");
                total+=entry.Length;if(entry.Length>110000000||total>220000000)throw new Exception("更新包展开后过大");
                string output=In(name,stage);Directory.CreateDirectory(Path.GetDirectoryName(output));using(var input=entry.Open())using(var writer=new FileStream(output,FileMode.CreateNew,FileAccess.Write))CopyEntry(input,writer,entry.Length);
            }
        }
        if(!names.Contains("ZeroDistance.exe")||!names.Contains("BUILD.json")||!names.Contains("engine/main.cjs")||!names.Contains("ui/index.html"))throw new Exception("更新包缺少完整程序");
        var build=UpdatePackage.Parse(File.ReadAllText(In("BUILD.json",stage)));if(UpdatePackage.Str(build,"version")!=version||UpdatePackage.Str(build,"product")!="ZeroDistance")throw new Exception("更新包版本不符");
        // Files not managed by the package (games, saves, user-added files) are never removed.
        try{
            foreach(string name in names.OrderBy(n=>n=="ZeroDistance.exe"?1:0)){
                string dest=In(name,target),old=In(name,backup),next=In(name,stage);Directory.CreateDirectory(Path.GetDirectoryName(dest));
                if(File.Exists(dest)){Directory.CreateDirectory(Path.GetDirectoryName(old));File.Copy(dest,old);}
                Remember(name);Retry(()=>{if(File.Exists(dest))File.Replace(next,dest,null);else File.Move(next,dest);});
            }
            // Remove only files explicitly inventoried by the previous publisher build.
            string inventory=Path.Combine(backup,"PACKAGE_FILES.json");if(File.Exists(inventory)){
                var previous=UpdatePackage.Read(inventory) as object[];
                if(previous!=null)foreach(string name in previous.OfType<string>())if(Allowed(name)&&!names.Contains(name)&&File.Exists(In(name,target))){string old=In(name,backup);Directory.CreateDirectory(Path.GetDirectoryName(old));File.Copy(In(name,target),old);Remember(name);Retry(()=>File.Delete(In(name,target)));}
            }
            if(!qa&&File.Exists(Path.Combine(target,"Uninstall.exe")))foreach(var view in new[]{RegistryView.Registry64,RegistryView.Registry32})using(var root=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,view))using(var key=root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ZeroDistanceNative",true))if(key!=null&&String.Equals(Convert.ToString(key.GetValue("InstallLocation")).TrimEnd('\\'),target.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))key.SetValue("DisplayVersion",version);
            UpdatePackage.Save(Path.Combine(updates,"last-result.json"),new{ok=true,from=UpdatePackage.Str(plan,"from"),to=version,backup=backup});
            File.Delete(Path.Combine(job,"touched.json"));
        }catch{
            Restore();
            throw;
        }
    }
    [DllImport("kernel32.dll")]static extern bool SetDefaultDllDirectories(uint flags);
    [STAThread]static void Main(string[] args){
        AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);
        SetDefaultDllDirectories(0x800);qa=args.Contains("--qa");noRestart=args.Contains("--no-restart");bool ok=false;try{int index=Array.IndexOf(args,"--apply");if(index<0||index+1>=args.Length)throw new Exception("缺少更新计划");Install(args[index+1],args.Contains("--recover"));ok=true;}
        catch(Exception error){try{if(updates!=null)UpdatePackage.Save(Path.Combine(updates,"last-result.json"),new{ok=false,error=error.Message,backup=backup});}catch{}if(!qa&&!noRestart&&lease!=null)MessageBox.Show("更新未完成，已尝试恢复旧文件。请关闭其他 ZeroDistance 窗口后重试。\n\n"+error.Message,"ZeroDistance",MessageBoxButtons.OK,MessageBoxIcon.Error);}
        bool recoverable=job!=null&&File.Exists(Path.Combine(job,"touched.json"));
        try{if(lease!=null&&updates!=null&&!recoverable)File.Delete(Path.Combine(updates,"active-job.json"));}catch{}
        if(lease!=null)lease.Dispose();
        if(!qa&&!noRestart&&target!=null&&!recoverable)try{Process.Start(new ProcessStartInfo(Path.Combine(target,"ZeroDistance.exe")){UseShellExecute=false,WorkingDirectory=target});}catch{}
        Environment.ExitCode=ok?0:1;
    }
}
