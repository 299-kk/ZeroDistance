using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Web.Script.Serialization;

// Runs from NSIS's private temporary folder, never from the application process.
// No registry-driven recursive deletion and no traversal through reparse points.
internal static class UninstallCleanup {
    const string Marker="app.zerodistance.native/0.3";
    static readonly HashSet<string> games=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    static readonly StringComparison Compare=StringComparison.OrdinalIgnoreCase;
    static string Full(string path){return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);}
    static bool Inside(string path,string root){return path.Equals(root,Compare)||path.StartsWith(root+Path.DirectorySeparatorChar,Compare);}
    static bool Link(string path){return (File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0;}
    static void PlainAncestors(string path){
        for(string parent=Path.GetDirectoryName(path);!String.IsNullOrEmpty(parent);parent=Path.GetDirectoryName(parent))
            if(Directory.Exists(parent)&&Link(parent))throw new Exception("路径经过目录链接，未执行清理："+path);
    }
    static string Arg(string[] args,string name){int i=Array.IndexOf(args,name);if(i<0||i+1>=args.Length)throw new Exception("缺少参数："+name);return Full(args[i+1]);}
    static bool Exists(string path){try{File.GetAttributes(path);return true;}catch(FileNotFoundException){return false;}catch(DirectoryNotFoundException){return false;}}
    // WebView2 can release its profile lock after the last window has closed.
    // Allow its asynchronous shutdown to finish; persistent locks still fail.
    static void Retry(Action action){for(int n=0;;n++)try{action();return;}catch(IOException){if(n==20)throw;Thread.Sleep(500);}catch(UnauthorizedAccessException){if(n==20)throw;Thread.Sleep(500);}}
    static void DeleteFile(string path){Retry(delegate{if(!Exists(path))return;if(!Link(path)){var attributes=File.GetAttributes(path);if((attributes&FileAttributes.ReadOnly)!=0)File.SetAttributes(path,attributes&~FileAttributes.ReadOnly);}File.Delete(path);});}
    static bool GameDirectory(string path){return Path.GetFileName(path).Equals(".minecraft",Compare)||Directory.Exists(Path.Combine(path,"versions"))||Directory.Exists(Path.Combine(path,"saves"))||File.Exists(Path.Combine(path,"level.dat"));}
    static void DeleteTree(string path){
        if(!Exists(path))return;
        var attributes=File.GetAttributes(path);
        // Unlink the link itself; never clear attributes on or visit its target.
        if((attributes&FileAttributes.ReparsePoint)!=0){if((attributes&FileAttributes.Directory)!=0)Retry(()=>Directory.Delete(path,false));else DeleteFile(path);return;}
        if((attributes&FileAttributes.Directory)==0){DeleteFile(path);return;}
        if(games.Contains(Full(path))||GameDirectory(path)){Console.WriteLine("保留游戏目录："+path);return;}
        foreach(string child in Directory.GetFileSystemEntries(path))DeleteTree(child);
        if(Directory.GetFileSystemEntries(path).Length==0)Retry(()=>Directory.Delete(path,false));
    }
    static void ReadGames(string profile){
        if(!Directory.Exists(profile)||Link(profile))return;
        string file=Path.Combine(profile,"settings.json");if(!File.Exists(file))return;
        try{
            var settings=new JavaScriptSerializer().DeserializeObject(File.ReadAllText(file)) as Dictionary<string,object>;
            if(settings==null)return;
            foreach(string key in new[]{"gameDir","activeFolder"})if(settings.ContainsKey(key)&&settings[key] is string)games.Add(Full((string)settings[key]));
            object folders;if(settings.TryGetValue("folders",out folders)&&folders is object[])foreach(object entry in (object[])folders){var folder=entry as Dictionary<string,object>;if(folder!=null&&folder.ContainsKey("path")&&folder["path"] is string)games.Add(Full((string)folder["path"]));}
        }catch{Console.WriteLine("配置不可读取，将通过游戏目录结构保护游戏文件。");}
    }
    static void PreserveRetryPlan(string install){
        string plan=Path.Combine(install,".uninstall-preserved-games.json");
        var json=new JavaScriptSerializer{MaxJsonLength=1024*1024};
        if(File.Exists(plan)){if(Link(plan))throw new Exception("卸载保护记录不能是文件链接。");foreach(string game in json.Deserialize<string[]>(File.ReadAllText(plan)))games.Add(Full(game));}
        // Retain these paths until NSIS confirms success. A failed cleanup may
        // already have removed settings.json before the user retries uninstall.
        File.WriteAllText(plan,json.Serialize(games.ToArray()));
    }
    static void CheckProcesses(string install){
        foreach(var process in Process.GetProcesses())using(process){
            if(process.Id==Process.GetCurrentProcess().Id)continue;
            string executable;try{executable=Full(process.MainModule.FileName);}catch{continue;}
            if(!Inside(executable,install))continue;
            string name=Path.GetFileName(executable);
            if(new[]{"ZeroDistance.exe","node.exe","StartupFeedback.exe","GameWindowFocus.exe"}.Contains(name,StringComparer.OrdinalIgnoreCase))
                throw new Exception("请先关闭此安装目录中的 ZeroDistance，再重试卸载。仍在运行："+name);
        }
    }
    [STAThread] static int Main(string[] args){
        try{
            string install=Arg(args,"--install-dir"),roaming=Arg(args,"--data-dir"),local=Arg(args,"--local-data-dir");
            if(install.Length<=Path.GetPathRoot(install).Length||!Directory.Exists(install)||Link(install))throw new Exception("安装目录无效，未执行清理。");
            PlainAncestors(install);PlainAncestors(roaming);PlainAncestors(local);
            if(!File.Exists(Path.Combine(install,"ZeroDistance.Native.marker"))||File.ReadAllText(Path.Combine(install,"ZeroDistance.Native.marker"))!=Marker)throw new Exception("安装目录标记不匹配，未执行清理。");
            if(args.Contains("--qa-root")){
                string qa=Arg(args,"--qa-root");PlainAncestors(qa);
                if(!qa.Split(Path.DirectorySeparatorChar).Contains(".qa")||!Inside(install,qa)||roaming!=Path.Combine(qa,"profile")||local!=Path.Combine(qa,"local-profile"))throw new Exception("QA 清理目录无效。");
            }else if(!roaming.Equals(Full(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"ZeroDistance-Native")),Compare)||!local.Equals(Full(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ZeroDistance-Native")),Compare))throw new Exception("软件数据目录不匹配，未执行清理。");
            CheckProcesses(install);
            if(args.Contains("--check-only"))return 0;
            ReadGames(roaming);
            PreserveRetryPlan(install);
            if(!args.Contains("--keep-data")){DeleteTree(roaming);DeleteTree(local);}
            foreach(string directory in new[]{"engine","ui","startup","licenses","legal"})DeleteTree(Path.Combine(install,directory));
            using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("files.json"))using(var reader=new StreamReader(stream)){
                var names=new JavaScriptSerializer().Deserialize<string[]>(reader.ReadToEnd());
                foreach(string name in names){if(Path.GetFileName(name)!=name||name=="."||name=="..")throw new Exception("安装文件清单无效。");DeleteFile(Path.Combine(install,name));}
            }
            Console.WriteLine("软件文件、账号设置、日志与浏览器缓存已清理。游戏目录和存档保留。");return 0;
        }catch(Exception error){Console.WriteLine("未能完成卸载清理："+error.Message+" 请关闭占用文件的程序后重试。");return 1;}
    }
}
