using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;

internal sealed partial class LauncherWindow {
    bool lowMemory,lowTransition,restoringInterface,designBusy,autoLowRequested,backendPaused,lastLowAutomatic;
    NotifyIcon lowMemoryTray;Panel lowMemoryPanel;TaskCompletionSource<bool> lowMemoryReady;
    readonly HashSet<string> lowMemoryLaunches=new HashSet<string>();
    readonly HashSet<string> pendingLowMemoryLaunches=new HashSet<string>();
    readonly HashSet<string> preparingGames=new HashSet<string>();
    readonly Dictionary<string,int> gameLaunchPids=new Dictionary<string,int>();
    readonly Dictionary<int,System.Diagnostics.Process> monitoredGames=new Dictionary<int,System.Diagnostics.Process>();
    bool WantsAutoLowMemory(){try{var settings=Json.Parse(File.ReadAllText(Path.Combine(dataDirectory,"settings.json")));return Json.Bool(settings,"lowMemoryAfterLaunch")&&!Json.Bool(settings,"closeAfterLaunch");}catch{return false;}}
    void LowMemoryState(string phase,bool keepCore){if(qa)try{Json.Atomic(Path.Combine(dataDirectory,"low-memory-state.json"),new{phase=phase,keepCore=keepCore,automatic=lastLowAutomatic,hostPid=System.Diagnostics.Process.GetCurrentProcess().Id,enginePid=backendPaused?0:engine.Pid,windowHandle=Handle.ToInt64().ToString()});}catch{}}
    async Task<object> RequestLowMemory(bool automatic){
        if(lowMemory||lowTransition)return new{ok=true};
        if(automatic&&preparingGames.Count>0)throw new Exception("仍有游戏正在启动");
        if(!accepted||!isMainPage||dirty||designBusy||mascotPending||busyOwners.Count>0||prefsOwners.Count>0)throw new Exception("请先完成或保存当前编辑，再进入低占用模式");
        var state=await engine.Invoke("__native:lowMemory",new object[0]);
        if(!Json.Bool(state,"ready"))throw new Exception(Json.Str(state,"reason"));
        lowTransition=true;bool keepCore=Json.Bool(state,"keepCore");
        BeginInvoke(new Action(async()=>await EnterLowMemory(keepCore,automatic)));
        return new{ok=true};
    }
    async Task EnterLowMemory(bool keepCore,bool automatic){
        try{
            lastLowAutomatic=automatic;
            var bounds=WindowState==FormWindowState.Normal?ClientSize:RestoreBounds.Size;Json.Atomic(Path.Combine(dataDirectory,"window.json"),new{width=bounds.Width,height=bounds.Height,maximized=WindowState==FormWindowState.Maximized});
            lowMemoryReady=new TaskCompletionSource<bool>();Emit(browser,"window:visibility",false);Emit(browser,"window:prepareLowMemory");
            await Task.WhenAny(lowMemoryReady.Task,Task.Delay(1200));lowMemoryReady=null;if(closing||allowClose)return;
            interfaceGeneration++;lowMemory=true;isMainPage=false;uiReady=false;splashAssembled=true;idleMemoryTimer.Stop();revealTimer.Stop();CloseSplash();nativeStartup=null;
            Controls.Remove(browser);browser.Dispose();environment=null;
            if(!keepCore){await engine.Stop();backendPaused=true;engineStart=null;}else engine.ReleaseIdleMemory();
            if(closing||allowClose)return;
            ShowLowMemoryPanel(keepCore);if(automatic)Hide();
            await Task.Delay(100);GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
            LowMemoryState("entered",keepCore);
        }catch(Exception error){Log("low-memory",error.ToString());lowMemory=browser.IsDisposed;if(lowMemory)BeginInvoke(new Action(async()=>await RestoreFullInterface()));else engine.Invoke("__native:resumeFull",new object[0]).ContinueWith(t=>{if(t.IsFaulted)Log("low-memory",t.Exception.Message);});MessageBox.Show(this,"进入低占用模式失败："+error.Message,Text);}
        finally{lowTransition=false;MaybeRestoreAfterGameExit();}
    }
    void ShowLowMemoryPanel(bool keepCore){
        if(lowMemoryTray==null){
            var menu=new ContextMenuStrip();menu.Items.Add("恢复主界面",null,async delegate{await RestoreFullInterface();});menu.Items.Add("退出 ZeroDistance",null,delegate{Close();});
            lowMemoryTray=new NotifyIcon{Icon=Icon,Text="ZeroDistance · 低占用模式",ContextMenuStrip=menu};lowMemoryTray.DoubleClick+=async delegate{await RestoreFullInterface();};
        }
        lowMemoryTray.Visible=true;WindowState=FormWindowState.Normal;MinimumSize=new Size(440,240);Size=new Size(480,270);Opacity=1;
        lowMemoryPanel=new Panel{Dock=DockStyle.Fill,BackColor=Color.FromArgb(18,23,19),ForeColor=Color.FromArgb(237,241,233),Padding=new Padding(24)};
        var title=new Label{Text="ZeroDistance · 低占用模式",Location=new Point(24,26),Size=new Size(430,28),Font=new Font("Microsoft YaHei UI",12,FontStyle.Bold)};
        var detail=new Label{Text="浏览器界面已释放，游戏继续运行。\n"+(keepCore?"已保留联机核心服务。":"没有活动联机，业务后端也已休眠。")+"\n下载、资源管理和皮肤等功能将在恢复界面后可用。",Location=new Point(24,72),Size=new Size(430,82),Font=new Font("Microsoft YaHei UI",9)};
        var restore=new Button{Text="恢复主界面",Location=new Point(24,178),Size=new Size(138,36),FlatStyle=FlatStyle.Flat,BackColor=Color.FromArgb(197,242,119),ForeColor=Color.FromArgb(24,41,15)};restore.Click+=async delegate{await RestoreFullInterface();};
        var hide=new Button{Text="收起到托盘",Location=new Point(174,178),Size=new Size(130,36),FlatStyle=FlatStyle.Flat};hide.Click+=delegate{Hide();};
        var exit=new Button{Text="退出",Location=new Point(316,178),Size=new Size(100,36),FlatStyle=FlatStyle.Flat};exit.Click+=delegate{Close();};
        title.MouseDown+=delegate(object sender,MouseEventArgs e){if(e.Button==MouseButtons.Left){ReleaseCapture();SendMessage(Handle,0x00A1,new IntPtr(2),IntPtr.Zero);}};
        lowMemoryPanel.Controls.AddRange(new Control[]{title,detail,restore,hide,exit});Controls.Add(lowMemoryPanel);
    }
    async Task RestoreFullInterface(){
        if(!lowMemory||lowTransition||closing)return;lowTransition=true;
        try{
            LowMemoryState("restoring",!backendPaused);if(lowMemoryTray!=null)lowMemoryTray.Visible=false;
            if(lowMemoryPanel!=null){Controls.Remove(lowMemoryPanel);lowMemoryPanel.Dispose();lowMemoryPanel=null;}
            if(backendPaused){engine=new BackendHost(this);engineStart=null;backendPaused=false;}
            else await engine.Invoke("__native:resumeFull",new object[0]);
            interfaceGeneration++;lowMemory=false;restoringInterface=true;isMainPage=false;uiReady=false;splashAssembled=false;prewarming=true;memoryInactive=false;completedStages.Clear();
            browser=new WebView2{Dock=DockStyle.Fill,DefaultBackgroundColor=Color.Black};Controls.Add(browser);await Initialize();
        }catch(Exception error){Log("low-memory",error.ToString());MessageBox.Show(this,"恢复主界面失败："+error.Message,Text);}
        finally{lowTransition=false;}
    }
    void MaybeRestoreAfterGameExit(){
        if(closing||allowClose||lowTransition||!lowMemory||!lastLowAutomatic||monitoredGames.Count>0||preparingGames.Count>0)return;
        Log("low-memory","所有已跟踪的游戏进程已退出，恢复主界面");
        BeginInvoke(new Action(async()=>{if(monitoredGames.Count==0&&preparingGames.Count==0&&lastLowAutomatic)await RestoreFullInterface();}));
    }
    void ForgetGame(int pid,System.Diagnostics.Process process){
        System.Diagnostics.Process current;
        if(!monitoredGames.TryGetValue(pid,out current)||!Object.ReferenceEquals(current,process))return;
        monitoredGames.Remove(pid);
        var ended=new List<string>();foreach(var entry in gameLaunchPids)if(entry.Value==pid)ended.Add(entry.Key);
        foreach(var id in ended){gameLaunchPids.Remove(id);pendingLowMemoryLaunches.Remove(id);}
        process.Dispose();MaybeRestoreAfterGameExit();
    }
    void TrackGame(string id,int pid){
        if(pid<=0)return;
        gameLaunchPids[id]=pid;if(monitoredGames.ContainsKey(pid))return;
        try{
            var process=System.Diagnostics.Process.GetProcessById(pid);monitoredGames.Add(pid,process);
            process.Exited+=delegate{try{if(!IsDisposed&&!closing)BeginInvoke(new Action(()=>ForgetGame(pid,process)));}catch{}};
            process.EnableRaisingEvents=true;
            if(process.HasExited)ForgetGame(pid,process);
        }catch(Exception error){
            System.Diagnostics.Process process;if(monitoredGames.TryGetValue(pid,out process)){monitoredGames.Remove(pid);process.Dispose();}
            gameLaunchPids.Remove(id);pendingLowMemoryLaunches.Remove(id);
            Log("low-memory","无法跟踪游戏进程 "+pid+"："+error.Message);
        }
    }
    void DisposeGameMonitors(){foreach(var process in monitoredGames.Values)process.Dispose();monitoredGames.Clear();gameLaunchPids.Clear();preparingGames.Clear();}
    void ObserveLowMemoryLaunch(string channel,object[] args){
        if(channel!="event:launchState"||args.Length==0)return;
        var state=args[0];string id=Json.Str(state,"launchId"),status=Json.Str(state,"status");
        if(id.Length==0)return;
        if(status=="launching"){preparingGames.Add(id);return;}
        if(status=="exited"||status=="error"){
            preparingGames.Remove(id);pendingLowMemoryLaunches.Remove(id);
            int pid;System.Diagnostics.Process process;
            if(gameLaunchPids.TryGetValue(id,out pid)&&monitoredGames.TryGetValue(pid,out process))ForgetGame(pid,process);
            else MaybeRestoreAfterGameExit();return;
        }
        if(status=="running"){preparingGames.Remove(id);TrackGame(id,Json.Int(state,"pid",0));}
        if(lowMemory||lowTransition||allowClose||!WantsAutoLowMemory()||id.Length==0||status!="running"||id.StartsWith("recovered:")||!lowMemoryLaunches.Add(id))return;
        if(!gameLaunchPids.ContainsKey(id))return;
        pendingLowMemoryLaunches.Add(id);
        if(lowMemoryLaunches.Count>256)lowMemoryLaunches.Clear();
        if(autoLowRequested)return;autoLowRequested=true;
        BeginInvoke(new Action(async()=>{
            try{int attempts=0;while(pendingLowMemoryLaunches.Count>0){await Task.Delay(2000);if(closing||allowClose||lowMemory||!WantsAutoLowMemory())return;try{await RequestLowMemory(true);return;}catch(Exception error){if(++attempts%30==0)Log("low-memory","自动切换暂缓："+error.Message);}}}
            finally{autoLowRequested=false;pendingLowMemoryLaunches.Clear();}
        }));
    }
}
