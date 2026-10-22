using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;

internal sealed class BackendHost {
    readonly LauncherWindow owner;
    readonly Dictionary<string,TaskCompletionSource<object>> pending=new Dictionary<string,TaskCompletionSource<object>>();
    readonly object sync=new object();
    readonly TaskCompletionSource<bool> ready=new TaskCompletionSource<bool>();
    Process process;StreamWriter input;int sequence;bool stopping;
    public int Pid {get{return process==null?0:process.Id;}}
    public BackendHost(LauncherWindow window){owner=window;}
    public async Task Start(object config){
        var info=new ProcessStartInfo(Path.Combine(owner.AppDirectory,"engine","node.exe"),"\""+Path.Combine(owner.AppDirectory,"engine","main.cjs")+"\""){
            UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,
            StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8,WorkingDirectory=Path.Combine(owner.AppDirectory,"engine")
        };
        info.EnvironmentVariables["ZERO_DISTANCE_NATIVE_CONFIG"]=Json.Stringify(config);
        // Do not inherit development hooks or flags into the distributed private engine.
        foreach(string key in new[]{"NODE_OPTIONS","NODE_PATH","ELECTRON_RUN_AS_NODE","ELECTRON_RENDERER_URL","ZERO_DISTANCE_DATA_DIR","ZERO_DISTANCE_DISCOVERY_ROOTS"})info.EnvironmentVariables.Remove(key);
        info.EnvironmentVariables["NODE_USE_SYSTEM_CA"]="1";
        // Keep imports, installer stages and download scratch files inside the
        // launcher profile so uninstall can remove them without scanning TEMP.
        string temporary=Path.Combine(owner.DataDirectory,"temp");Directory.CreateDirectory(temporary);
        info.EnvironmentVariables["TEMP"]=temporary;info.EnvironmentVariables["TMP"]=temporary;info.EnvironmentVariables["TMPDIR"]=temporary;
        process=new Process{StartInfo=info,EnableRaisingEvents=true};
        process.OutputDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data!=null)Receive(e.Data);};
        process.ErrorDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data!=null)owner.Log("engine",e.Data);};
        process.Exited+=delegate{if(!stopping){ready.TrySetException(new Exception("功能后端提前退出，请查看本地日志"));FailPending();owner.BackendFailed();}};
        if(!process.Start())throw new Exception("无法启动功能后端");
        input=new StreamWriter(process.StandardInput.BaseStream,new UTF8Encoding(false)){AutoFlush=true};
        process.BeginOutputReadLine();process.BeginErrorReadLine();
        var timeout=Task.Delay(45000);if(await Task.WhenAny(ready.Task,timeout)!=ready.Task)throw new Exception("功能后端初始化超过 45 秒");await ready.Task;
    }
    public void Write(object message){lock(sync){if(process==null||process.HasExited)throw new Exception("功能后端尚未就绪");input.WriteLine(Json.Stringify(message));input.Flush();}}
    void Receive(string line){
        try{
            if(line.Length>144*1024*1024)throw new Exception("后端响应过大");var value=Json.Parse(line);
            if(Json.Bool(value,"ready")){ready.TrySetResult(true);return;}
            if(Json.Get(value,"fatal")!=null){ready.TrySetException(new Exception(Json.Str(value,"fatal")));return;}
            if(Json.Get(value,"native")!=null){owner.NativeRequest(value);return;}
            string channel=Json.Str(value,"event");if(channel!=""){owner.EngineEvent(channel,Json.Args(value));return;}
            string id=Json.Str(value,"id");TaskCompletionSource<object> request=null;
            lock(sync){if(pending.TryGetValue(id,out request))pending.Remove(id);}
            if(request!=null){if(Json.Get(value,"error")!=null)request.TrySetException(new Exception(Json.Str(value,"error")));else request.TrySetResult(Json.Get(value,"result"));}
        }catch(Exception error){owner.Log("transport",error.Message);}
    }
    public async Task<object> Invoke(string channel,object[] args){
        string id;var completion=new TaskCompletionSource<object>();lock(sync){id="n"+(++sequence);pending[id]=completion;}
        try{Write(new{id=id,channel=channel,args=args});return await completion.Task;}catch{lock(sync){pending.Remove(id);}throw;}
    }
    public void Send(string channel,object[] args){Write(new{send=true,channel=channel,args=args});}
    void FailPending(){
        TaskCompletionSource<object>[] requests;
        lock(sync){requests=new TaskCompletionSource<object>[pending.Count];pending.Values.CopyTo(requests,0);pending.Clear();}
        // Completing a task can run its continuation immediately. Detach the
        // requests first so a continuation may safely issue or remove requests.
        foreach(var request in requests)request.TrySetException(new Exception("功能后端连接已关闭"));
    }
    public async Task Stop(){
        if(stopping)return;stopping=true;
        try{Write(new{control="shutdown"});}catch{}
        if(process!=null){await Task.Run(()=>process.WaitForExit(7000));try{if(!process.HasExited)process.Kill();}catch{}}
        FailPending();
    }
}
