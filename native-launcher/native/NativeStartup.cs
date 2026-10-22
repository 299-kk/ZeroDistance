using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

// Reuse the original alpha-composited full-screen scene, including its high-DPI
// face texture, pointer physics and reduced-motion path. The quick profile
// overlaps convergence with real initialization and has no artificial hold.
internal sealed class NativeStartup : IDisposable {
    readonly string signal;readonly bool qa;readonly Action<bool> reveal;
    readonly Timer timer=new Timer{Interval=20};
    Process process;int pid;bool ready,visible,assembled,finished,revealed,disposed;
    string last="";
    public NativeStartup(string app,string data,bool isolated,Action<bool> onReveal,bool reduceMotion=false,bool forceMotion=false){
        qa=isolated;reveal=onReveal;signal=Path.Combine(data,"startup-"+Guid.NewGuid().ToString("N")+".control");
        Write("loading\n读取配置…");
        var info=new ProcessStartInfo(Path.Combine(app,"startup","StartupFeedback.exe"),"\""+signal+"\" "+Process.GetCurrentProcess().Id+" --quick-start"+(reduceMotion?" --reduced-motion":forceMotion?" --full-motion":"")){UseShellExecute=false,CreateNoWindow=true};
        if(qa)info.EnvironmentVariables["KAMUCL_FRAME_PROBE"]=signal+".frames";
        process=Process.Start(info);pid=process.Id;timer.Tick+=delegate{Tick();};timer.Start();
    }
    void Write(string value){if(last==value)return;File.WriteAllText(signal,value,new UTF8Encoding(false));last=value;}
    public void Publish(IList<string> stages,bool rendererReady){
        ready=rendererReady;
        if(disposed){if(ready&&!revealed){revealed=true;reveal(false);}return;}
        if(revealed)return;
        var labels=new[]{"读取配置…","加载账户…","扫描游戏实例…","准备主界面…","准备首帧…"};
        Write(ready?"ready":(stages.Count>=3?"assembling\n":"loading\n")+labels[Math.Min(4,stages.Count)]);
    }
    void Tick(){
        if(disposed)return;
        try{
            visible=visible||File.Exists(signal+".visible");
            if(ready&&!revealed&&File.Exists(signal+".assembled")){
                string state=File.ReadAllText(signal+".assembled");
                if(state=="ready"||state=="reduced"){assembled=true;revealed=true;reveal(state!="reduced");Write("reveal");}
            }
            if(File.Exists(signal+".finished")){finished=true;Dispose();return;}
            if(process.HasExited){Dispose();if(ready&&!revealed){revealed=true;reveal(false);}}
        }catch(IOException){}catch(InvalidOperationException){Dispose();}
    }
    public object Info(){return new{source="original-native-StartupFeedback",pid=pid,visible=visible,assembled=assembled,finished=finished,signal=qa?signal:null};}
    public void Dispose(){
        if(disposed)return;disposed=true;timer.Stop();timer.Dispose();try{Write("closed");}catch{}
        if(!qa)foreach(string suffix in new[]{"",".visible",".assembled",".finished"})try{File.Delete(signal+suffix);}catch{}
        if(process!=null)process.Dispose();
    }
}
