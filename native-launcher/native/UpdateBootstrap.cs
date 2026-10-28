using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Security.Cryptography;
using System.Threading;

internal static class UpdateBootstrap {
    public static bool TryStart(string version,string[] args,bool onExit=false){
        if(args.Contains("--qa"))return false;
        return TryStartIn(version,AppDomain.CurrentDomain.BaseDirectory,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"ZeroDistance-Native"),onExit);
    }
    // Called only with fixed local paths in production; the separate test harness can isolate them.
    internal static bool TryStartIn(string version,string app,string profile,bool onExit){
        app=Path.GetFullPath(app).TrimEnd(Path.DirectorySeparatorChar);profile=Path.GetFullPath(profile);
        string updates=Path.Combine(profile,"updates"),pending=Path.Combine(updates,"pending.json");
        try{
            UpdatePackage.Plain(app);UpdatePackage.Plain(profile);
            string active=Path.Combine(updates,"active-job.json");
            if(File.Exists(active)){
                if(onExit)return false;
                string recoveryPlan=UpdatePackage.Under(UpdatePackage.Str(UpdatePackage.Read(active),"plan"),updates);var previous=UpdatePackage.Read(recoveryPlan);
                UpdatePackage.Verify(UpdatePackage.Get(previous,"envelope"),null);
                if(!String.Equals(UpdatePackage.Str(previous,"target").TrimEnd('\\'),app,StringComparison.OrdinalIgnoreCase)||!String.Equals(Path.GetFullPath(UpdatePackage.Str(previous,"dataDirectory")),profile,StringComparison.OrdinalIgnoreCase))throw new Exception("恢复目标与当前程序不符");
                string recoveryJob=Path.GetDirectoryName(recoveryPlan);bool waited=false;
                for(int n=0;n<450;n++){
                    try{using(var check=new FileStream(UpdatePackage.Under(Path.Combine(recoveryJob,"update.lock"),recoveryJob),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)){}break;}
                    catch(IOException){waited=true;Thread.Sleep(100);if(n==449)return true;}
                }
                if(waited&&!File.Exists(active)){Process.Start(new ProcessStartInfo(Path.Combine(app,"ZeroDistance.exe")){UseShellExecute=false,WorkingDirectory=app});return true;}
                Start(app,recoveryJob,recoveryPlan,true,false);return true;
            }
            if(!File.Exists(pending))return false;
            UpdatePackage.Under(pending,updates);
            // A downloaded update cannot bypass an updated first-use declaration.
            var consent=UpdatePackage.Read(Path.Combine(profile,"consent.json"));byte[] declaration=File.ReadAllBytes(Path.Combine(app,"legal/disclaimer.json"));string hash;
            using(var sha=SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(declaration)).Replace("-","").ToLowerInvariant();
            if(UpdatePackage.Str(consent,"contentHash")!=hash)return false;
            object ready=UpdatePackage.Read(pending),envelope=UpdatePackage.Get(ready,"envelope"),payload=UpdatePackage.Verify(envelope,null);string next=UpdatePackage.Str(payload,"version");
            if(UpdatePackage.VersionOf(next)<=UpdatePackage.VersionOf(version)){File.Delete(pending);return false;}
            var asset=UpdatePackage.Get(payload,"asset");string zip=UpdatePackage.Under(Path.Combine(updates,next,UpdatePackage.Str(asset,"name")),updates);
            if(UpdatePackage.Str(ready,"file")!=zip)throw new Exception("待安装更新路径无效");using(var verified=UpdatePackage.VerifiedZip(zip,asset)){}
            string job=Path.Combine(updates,"run-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(job);UpdatePackage.Plain(job);
            using(var verified=UpdatePackage.TrustedHelper(app,job)){}
            string plan=Path.Combine(job,"plan.json");UpdatePackage.Save(plan,new{envelope=envelope,file=zip,target=app.TrimEnd(Path.DirectorySeparatorChar),dataDirectory=profile,from=version,pid=Process.GetCurrentProcess().Id});
            File.Move(pending,Path.Combine(job,"claimed.json"));
            UpdatePackage.Save(Path.Combine(updates,"active-job.json"),new{plan=plan});
            try{Start(app,job,plan,false,onExit);}
            catch{File.Move(Path.Combine(job,"claimed.json"),pending);File.Delete(Path.Combine(updates,"active-job.json"));throw;}
            return true;
        }catch(Exception error){try{UpdatePackage.Save(Path.Combine(updates,"last-result.json"),new{ok=false,error=error.Message});}catch{}return false;}
    }
    static void Start(string app,string job,string plan,bool recover,bool noRestart){
        using(var verified=UpdatePackage.TrustedHelper(app,job)){
            var child=Process.Start(new ProcessStartInfo(Path.Combine(job,"UpdateHelper.exe"),"--apply \""+plan+"\""+(recover?" --recover":"")+(noRestart?" --no-restart":"")){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,WorkingDirectory=job});
            if(child==null)throw new Exception("无法启动更新助手");child.Dispose();
        }
    }
}
