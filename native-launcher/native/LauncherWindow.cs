using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.VisualBasic.FileIO;

internal sealed class LauncherWindow : Form {
    const string Origin="https://zerodistance-native.test/",Version="0.3.1";
    const string LegacyStorageUrl="https://zerodistance-native.local/__ui_migration.html";
    readonly WebView2 browser=new WebView2();
    WebView2 splashBrowser;Form splash;CoreWebView2Environment environment;
    NativeStartup nativeStartup;
    readonly System.Windows.Forms.Timer revealTimer=new System.Windows.Forms.Timer{Interval=16};
    readonly Stopwatch revealClock=new Stopwatch();
    readonly BackendHost engine;
    Task engineStart;
    readonly string dataDirectory,noticeText,noticeHash;
    readonly object logSync=new object();
    readonly bool qa,noDiscovery,ordinaryBrowser;readonly int debugPort;
    readonly bool migrateUiStorage,forceStartupMotion,disableStartupAnimation;
    bool importingUiStorage,uiStorageCommitted;string migrationScript;
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer{Interval=100};
    readonly Stopwatch clock=Stopwatch.StartNew();
    readonly Dictionary<string,long> bootTimings=new Dictionary<string,long>();
    readonly List<string> completedStages=new List<string>();
    readonly HashSet<string> busyOwners=new HashSet<string>(),prefsOwners=new HashSet<string>();
    bool accepted,presented,closing,allowClose,dirty,mascotPending,deferredClose,review,uiReady,splashAssembled,prewarming,darkTheme=true;
    double readingMilliseconds;long previousTick;bool isMainPage;
    public string AppDirectory {get;private set;}
    public string DataDirectory {get{return dataDirectory;}}
    [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")]static extern bool ReleaseCapture();
    [DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr handle,int message,IntPtr wParam,IntPtr lParam);
    [DllImport("user32.dll")]static extern int GetWindowLong(IntPtr window,int index);
    [DllImport("user32.dll")]static extern int SetWindowLong(IntPtr window,int index,int value);
    [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr handle,int attribute,ref int value,int size);
    [DllImport("dwmapi.dll")]static extern int DwmExtendFrameIntoClientArea(IntPtr handle,ref Margins margins);
    [StructLayout(LayoutKind.Sequential)]struct Margins{public int Left,Right,Top,Bottom;}
    static string Argument(string[] args,string key){int i=Array.IndexOf(args,key);if(i<0||i+1>=args.Length)throw new Exception("缺少参数："+key);return args[i+1];}
    static string Hash(string value){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-","").ToLowerInvariant();}
    protected override CreateParams CreateParams {get{var value=base.CreateParams;value.Style|=0x00040000|0x00C00000|0x00020000|0x00010000;return value;}}
    protected override void WndProc(ref Message message){
        if(message.Msg==0x0083&&message.WParam!=IntPtr.Zero){message.Result=IntPtr.Zero;return;}
        base.WndProc(ref message);
    }
    public LauncherWindow(string[] args){
        AppDirectory=AppDomain.CurrentDomain.BaseDirectory;
        qa=args.Contains("--qa");noDiscovery=(qa&&!args.Contains("--qa-scan-folders"))||args.Contains("--no-auto-discovery");
        ordinaryBrowser=qa&&args.Contains("--qa-ordinary-browser");
        forceStartupMotion=qa&&args.Contains("--qa-full-startup-motion");
        dataDirectory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"ZeroDistance-Native");
        if(qa){dataDirectory=Path.GetFullPath(Argument(args,"--data-dir"));if(!dataDirectory.Split(Path.DirectorySeparatorChar).Contains(".qa"))throw new Exception("QA 数据目录必须位于 .qa 中");if(!Int32.TryParse(Argument(args,"--cdp-port"),out debugPort)||debugPort<1024||debugPort>65535)throw new Exception("调试端口无效");}
        Directory.CreateDirectory(dataDirectory);
        try{disableStartupAnimation=Json.Bool(Json.Parse(File.ReadAllText(Path.Combine(dataDirectory,"settings.json"))),"disableStartupAnimation");}catch{}
        migrateUiStorage=!File.Exists(Path.Combine(dataDirectory,"ui-origin-v2.json"))&&Directory.Exists(Path.Combine(dataDirectory,"webview","EBWebView","Default","Local Storage","leveldb"));
        noticeText=File.ReadAllText(Path.Combine(AppDirectory,"legal/disclaimer.json"),Encoding.UTF8);noticeHash=Hash(noticeText);
        try{accepted=Json.Str(Json.Parse(File.ReadAllText(Path.Combine(dataDirectory,"consent.json"))),"contentHash")==noticeHash;}catch{}
        Text="ZeroDistance";StartPosition=FormStartPosition.CenterScreen;AutoScaleMode=AutoScaleMode.Dpi;
        // Configure alpha before the very first native ShowWindow. Hiding in
        // Shown is too late: DWM may already have composed a black client frame.
        Opacity=0;
        Size=accepted?new Size(1360,860):new Size(800,740);MinimumSize=new Size(760,620);BackColor=Color.Black;
        try{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);}catch{}
        browser.Dock=DockStyle.Fill;browser.DefaultBackgroundColor=Color.Transparent;Controls.Add(browser);
        engine=new BackendHost(this);
        Shown+=async delegate{if(qa)try{Json.Atomic(Path.Combine(dataDirectory,"startup-window.json"),new{opacity=Opacity,showInTaskbar=ShowInTaskbar,handle=Handle.ToInt64().ToString(),layered=(GetWindowLong(Handle,-20)&0x80000)!=0});}catch{}ApplyMaterial(this,true);if(accepted)StartNativeScene();await Initialize();};
        revealTimer.Tick+=delegate{
            double p=Math.Min(1,revealClock.Elapsed.TotalMilliseconds/120.0);Opacity=p*p*(3-2*p);
            if(p>=1){revealTimer.Stop();Opacity=1;FinishRenderingWarmup();}
        };
        Resize+=delegate{EmitVisibility();};VisibleChanged+=delegate{EmitVisibility();};
        FormClosing+=OnClosing;
        timer.Tick+=delegate{
            long now=clock.ElapsedMilliseconds;
            if(presented&&!accepted&&Visible&&WindowState!=FormWindowState.Minimized&&GetForegroundWindow()==Handle)readingMilliseconds+=Math.Max(0,Math.Min(250,now-previousTick));
            previousTick=now;
            if(presented&&(!accepted||review))Emit(browser,"consent:state",ConsentState());
            if(splash!=null&&!splash.IsDisposed&&splashBrowser!=null&&splashBrowser.CoreWebView2!=null){var point=Cursor.Position;Emit(splashBrowser,"boot:pointer",new{x=point.X-splash.Left,y=point.Y-splash.Top});}
        };timer.Start();
    }
    public void Log(string scope,string message){try{lock(logSync)File.AppendAllText(Path.Combine(dataDirectory,"native-current.log"),DateTime.UtcNow.ToString("o")+" ["+scope+"] "+message+Environment.NewLine);}catch{}}
    void MarkBoot(string stage){if(!bootTimings.ContainsKey(stage))bootTimings[stage]=clock.ElapsedMilliseconds;}
    static bool IsLocal(string uri){Uri value;return Uri.TryCreate(uri,UriKind.Absolute,out value)&&value.Scheme=="https"&&value.Host==new Uri(Origin).Host&&value.IsDefaultPort;}
    public static void ApplyMaterial(Form window,bool dark){
        try{int darkValue=dark?1:0,backdrop=3,corners=2;DwmSetWindowAttribute(window.Handle,20,ref darkValue,4);DwmSetWindowAttribute(window.Handle,38,ref backdrop,4);DwmSetWindowAttribute(window.Handle,33,ref corners,4);var margins=new Margins{Left=-1,Right=-1,Top=-1,Bottom=-1};DwmExtendFrameIntoClientArea(window.Handle,ref margins);}catch{}
    }
    async Task Initialize(){
        try{
            var options=new CoreWebView2EnvironmentOptions();
            if(qa&&!ordinaryBrowser)options.AdditionalBrowserArguments="--remote-debugging-port="+debugPort+" --remote-debugging-address=127.0.0.1 --disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding --disable-background-timer-throttling";
            // An accepted profile can load its engine alongside WebView2.
            // First-run consent still creates no backend process.
            if(accepted)engineStart=StartBackend();
            environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dataDirectory,"webview"),options);
            await ConfigureBrowser(browser,false);
            MarkBoot("webview");
            if(accepted)await StartApplication();else browser.Source=new Uri(Origin+"consent.html");
        }catch(Exception error){Log("startup",error.ToString());MessageBox.Show(this,"启动失败："+error.Message+"\n请确认已安装 Microsoft Edge WebView2 运行时。",Text,MessageBoxButtons.OK,MessageBoxIcon.Error);allowClose=true;Close();}
    }
    async Task ConfigureBrowser(WebView2 view,bool isSplash){
        await view.EnsureCoreWebView2Async(environment);
        var core=view.CoreWebView2;core.Settings.AreHostObjectsAllowed=false;core.Settings.AreDevToolsEnabled=qa;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.IsGeneralAutofillEnabled=false;core.Settings.IsPasswordAutosaveEnabled=false;
        // Let the browser load immutable shipped UI files directly. Managed
        // pictures/plugins retain their separate, authorized request handlers.
        core.SetVirtualHostNameToFolderMapping(new Uri(Origin).Host,Path.Combine(AppDirectory,"ui"),CoreWebView2HostResourceAccessKind.Deny);
        core.AddWebResourceRequestedFilter(LegacyStorageUrl,CoreWebView2WebResourceContext.All,CoreWebView2WebResourceRequestSourceKinds.All);
        core.WebResourceRequested+=Resource;
        core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){if(!IsLocal(e.Uri)&&e.Uri!="about:blank"&&!(importingUiStorage&&e.Uri==LegacyStorageUrl))e.Cancel=true;if(e.Uri==Origin+"index.html")MarkBoot("navigation");};
        core.DOMContentLoaded+=delegate{if(core.Source==Origin+"index.html"){MarkBoot("dom");CommitUiStorage();}};
        core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;Uri url;if(accepted&&Uri.TryCreate(e.Uri,UriKind.Absolute,out url)&&(url.Scheme=="https"||url.Scheme=="http"))OpenExternal(e.Uri);};
        core.PermissionRequested+=delegate(object sender,CoreWebView2PermissionRequestedEventArgs e){e.State=CoreWebView2PermissionState.Deny;};
        core.WebMessageReceived+=async delegate(object sender,CoreWebView2WebMessageReceivedEventArgs e){await Receive(view,isSplash,e);};
        core.NavigationCompleted+=delegate{if(!isSplash&&core.Source.EndsWith("/consent.html")){Opacity=1;ShowInTaskbar=true;Show();Activate();}};
        if(!isSplash){
            core.AddWebResourceRequestedFilter("https://zerodistance-assets.local/*",CoreWebView2WebResourceContext.All,CoreWebView2WebResourceRequestSourceKinds.All);
            core.AddWebResourceRequestedFilter("https://zerodistance-plugins.local/*",CoreWebView2WebResourceContext.All,CoreWebView2WebResourceRequestSourceKinds.All);
            core.ProcessFailed+=delegate{Log("webview","渲染进程异常退出");dirty=false;busyOwners.Clear();prefsOwners.Clear();mascotPending=false;};
        }
    }
    object ConsentState(){return new{version=Json.Str(Json.Parse(noticeText),"version"),remainingMs=Math.Max(0,3000-(int)readingMilliseconds),canAccept=accepted||readingMilliseconds>=3000,review=review};}
    void Post(WebView2 view,object message){if(closing||view==null||view.IsDisposed||view.CoreWebView2==null)return;try{view.CoreWebView2.PostWebMessageAsJson(Json.Stringify(message));}catch{}}
    void Emit(WebView2 view,string channel,params object[] args){Post(view,new{@event=channel,args=args});}
    void EmitVisibility(){if(isMainPage)Emit(browser,"window:visibility",!prewarming&&Visible&&WindowState!=FormWindowState.Minimized);}
    async Task Receive(WebView2 view,bool isSplash,CoreWebView2WebMessageReceivedEventArgs e){
        if(!IsLocal(e.Source)||closing)return;object id=null;bool send=false;
        try{
            string input=e.TryGetWebMessageAsString();if(input.Length>144*1024*1024)throw new Exception("请求过大");var request=Json.Parse(input);id=Json.Get(request,"id");send=Json.Bool(request,"send");string channel=Json.Str(request,"channel");var args=Json.Args(request);
            if(channel.Length==0||channel.Length>120||channel.StartsWith("__")||args.Length>32)throw new Exception("无效功能请求");
            object result=null;
            if(channel=="native:info")result=new{version=Version,engine="C# + WebView2 + compatibility backend",enginePid=engine.Pid,dataDirectory=dataDirectory,webview=environment.BrowserVersionString,qa=qa,uiSource="original-renderer",bundlesElectron=false,startup=nativeStartup==null?null:nativeStartup.Info(),windowOpacity=Opacity,windowHandle=Handle.ToInt64().ToString(),layered=(GetWindowLong(Handle,-20)&0x80000)!=0};
            else if(channel=="native:qaFocus"&&qa){WindowState=FormWindowState.Normal;Show();Activate();SetForegroundWindow(Handle);}
            else if(channel=="native:qaHide"&&qa){Hide();}
            else if(channel=="window:visibility")result=!prewarming&&Visible&&WindowState!=FormWindowState.Minimized;
            else if(channel=="consent:ready"){presented=true;previousTick=clock.ElapsedMilliseconds;result=ConsentState();}
            else if(channel=="consent:accept"){
                if(review){review=false;browser.Source=new Uri(Origin+"index.html");result=new{ok=true};}
                else{
                    if(!presented||readingMilliseconds<3000||GetForegroundWindow()!=Handle)throw new Exception("请在前台阅读满三秒后同意");
                    Json.Atomic(Path.Combine(dataDirectory,"consent.json"),new{version=Json.Str(Json.Parse(noticeText),"version"),contentHash=noticeHash,acceptedAt=DateTime.UtcNow.ToString("o"),product="ZeroDistance-Native"});accepted=true;result=new{ok=true};
                    BeginInvoke(new Action(async()=>{try{await StartApplication();}catch(Exception error){Log("startup",error.ToString());MessageBox.Show(this,error.Message,Text);allowClose=true;Close();}}));
                }
            }
            else if(channel=="consent:reject"){if(review){review=false;browser.Source=new Uri(Origin+"index.html");}else{allowClose=true;BeginInvoke(new Action(Close));}}
            else if(channel=="window:close"||channel=="app:close")BeginInvoke(new Action(Close));
            else{
                if(!accepted)throw new Exception("请先阅读并同意使用声明");
                if(channel=="native:filePaths"){
                    if(isSplash)throw new Exception("无效文件来源");var files=e.AdditionalObjects;if(files.Count>256)throw new Exception("选择文件过多");var paths=new List<string>();
                    foreach(var item in files){var file=item as CoreWebView2File;if(file==null)throw new Exception("无效文件对象");paths.Add(file.Path);}result=paths;
                }
                else if(channel=="window:minimize")WindowState=FormWindowState.Minimized;
                else if(channel=="window:maximize")ToggleMaximize();
                else if(channel=="window:drag"){Emit(browser,"window:caption-pointerdown");ReleaseCapture();SendMessage(Handle,0x00A1,new IntPtr(2),IntPtr.Zero);}
                else if(channel=="window:resize"){int hit=Convert.ToInt32(args[0]);if(hit>=10&&hit<=17&&WindowState!=FormWindowState.Maximized){ReleaseCapture();SendMessage(Handle,0x00A1,new IntPtr(hit),IntPtr.Zero);}}
                else if(channel=="window:skinEditorDirty")dirty=args.Length>0&&args[0] is bool&&(bool)args[0];
                else if(channel=="window:mascotPending")mascotPending=args.Length>0&&args[0] is bool&&(bool)args[0];
                else if(channel=="window:skinEditorBusy"||channel=="window:skinEditorPrefsPending"){
                    var owners=channel=="window:skinEditorBusy"?busyOwners:prefsOwners;string owner=args.Length>0?Json.Str(args[0],"ownerId"):"";
                    if(owner.Length>0&&owner.Length<=64){if(Json.Bool(args[0],"pending"))owners.Add(owner);else owners.Remove(owner);}
                    if(deferredClose&&prefsOwners.Count==0&&!dirty&&busyOwners.Count==0){deferredClose=false;BeginInvoke(new Action(Close));}
                }
                else if(channel=="window:skinEditorQuit"||channel=="window:mascotQuit"){if(!dirty&&!mascotPending&&busyOwners.Count==0&&prefsOwners.Count==0)BeginInvoke(new Action(Close));}
                else if(channel=="boot:stage"){if(!isSplash&&args.Length>0){string stage=Convert.ToString(args[0]);if(new[]{"settings","accounts","instances","assets","paint"}.Contains(stage)&&!completedStages.Contains(stage)){completedStages.Add(stage);MarkBoot(stage);}PublishBoot();}}
                else if(channel=="boot:renderer-ready"){uiReady=true;PublishBoot();engine.Send(channel,args);}
                else if(channel=="boot:splash-ready"){if(isSplash)PublishBoot();}
                else if(channel=="boot:assembled"){if(isSplash&&uiReady){splashAssembled=true;Show();Activate();Emit(splashBrowser,"boot:reveal");}}
                else if(channel=="boot:finished"){if(isSplash&&splashAssembled)CloseSplash();}
                else if(channel=="boot:splash-failed"){Log("splash","动画失败，显示已准备的主窗口");if(uiReady){CloseSplash();Show();}}
                else if(channel=="legal:review"){review=true;presented=false;browser.Source=new Uri(Origin+"consent.html");}
                else if(isSplash)throw new Exception("启动窗口无此权限");
                else if(send)engine.Send(channel,args);
                else result=await engine.Invoke(channel,args);
            }
            if(!send)Post(view,new{id=id,result=result});
        }catch(Exception error){if(!send)Post(view,new{id=id,error=error.Message});else Log("ipc",error.Message);}
    }
    void ToggleMaximize(){if(WindowState==FormWindowState.Maximized)WindowState=FormWindowState.Normal;else{MaximizedBounds=Screen.FromHandle(Handle).WorkingArea;WindowState=FormWindowState.Maximized;}}
    object DisplayInfo(){var display=Screen.FromHandle(Handle);return new{id=1,scaleFactor=DeviceDpi/96.0,bounds=new{x=display.Bounds.X,y=display.Bounds.Y,width=display.Bounds.Width,height=display.Bounds.Height},workArea=new{x=display.WorkingArea.X,y=display.WorkingArea.Y,width=display.WorkingArea.Width,height=display.WorkingArea.Height},size=new{width=display.Bounds.Width,height=display.Bounds.Height},workAreaSize=new{width=display.WorkingArea.Width,height=display.WorkingArea.Height}};}
    async Task StartApplication(){
        if(isMainPage)return;isMainPage=true;review=false;prewarming=true;Opacity=0;
        Size=new Size(1360,860);MinimumSize=new Size(960,620);RestoreBoundsFromFile();
        browser.Visible=true;Show();
        StartNativeScene();
        await MigrateUiStorage();
        // Allow the original renderer's two painted frames to complete behind
        // the native overlay. Restore ordinary focus/occlusion after revealing.
        await browser.CoreWebView2.CallDevToolsProtocolMethodAsync("Emulation.setFocusEmulationEnabled","{\"enabled\":true}");
        MarkBoot("controller");
        await EnsureBackendStarted();
        browser.Source=new Uri(Origin+"index.html");
        // A hidden WinForms parent throttles Chromium's requestAnimationFrame
        // to one frame per second. Keep the real controller visible at zero
        // alpha behind the startup scene so its first painted frames run now.
        Opacity=0;Show();
        var fallback=new System.Windows.Forms.Timer{Interval=30000};fallback.Tick+=delegate{fallback.Stop();fallback.Dispose();if(!splashAssembled&&!closing){Log("splash","启动首帧等待超过 30 秒");CloseSplash();RevealMain(false);if(!uiReady)MessageBox.Show(this,"界面初始化尚未完成，请查看 native-current.log。",Text);}};fallback.Start();
    }
    Task EnsureBackendStarted(){if(engineStart==null)engineStart=StartBackend();return engineStart;}
    async Task StartBackend(){
        var paths=new Dictionary<string,string>{
            {"appData",Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)},{"home",Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)},
            {"desktop",Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)},{"documents",Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)},
            {"downloads",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),"Downloads")}
        };
        await engine.Start(new{executable=Application.ExecutablePath,appDirectory=AppDirectory,dataDirectory=dataDirectory,paths=paths,version=Version,hwnd=Handle.ToInt64().ToString(),display=DisplayInfo(),qa=qa,noDiscovery=noDiscovery});
        MarkBoot("backend");
    }
    void StartNativeScene(){if(disableStartupAnimation||nativeStartup!=null)return;try{bool reduce=false;try{reduce=Json.Bool(Json.Parse(File.ReadAllText(Path.Combine(dataDirectory,"settings.json"))),"reduceMotion");}catch{}nativeStartup=new NativeStartup(AppDirectory,dataDirectory,qa,RevealMain,reduce,forceStartupMotion);}catch(Exception error){Log("splash",error.Message);}}
    async Task MigrateUiStorage(){
        if(!migrateUiStorage||migrationScript!=null)return;
        var core=browser.CoreWebView2;var loaded=new TaskCompletionSource<bool>();
        EventHandler<CoreWebView2DOMContentLoadedEventArgs> listener=delegate{if(core.Source==LegacyStorageUrl)loaded.TrySetResult(true);};
        importingUiStorage=true;core.DOMContentLoaded+=listener;
        try{
            core.Navigate(LegacyStorageUrl);
            if(await Task.WhenAny(loaded.Task,Task.Delay(5000))!=loaded.Task)throw new Exception("旧版界面偏好读取超时");
            const string filter="['kamucl.lastPlayed','kamucl.bannerAlign','kamucl.lastVersion','kamucl.resourceExpanded','kamucl:bg-last-index'].includes(k)||k.startsWith('zerodistance.gallery.')";
            string values=await core.ExecuteScriptAsync("Object.entries(localStorage).filter(([k,v])=>("+filter+")&&v.length<=524288)");
            var entries=Json.Parse(values) as object[];if(entries==null)throw new Exception("旧版界面偏好格式无效");
            migrationScript=await core.AddScriptToExecuteOnDocumentCreatedAsync("if(location.origin==="+Json.Stringify(Origin.TrimEnd('/'))+"){try{for(const [k,v] of "+Json.Stringify(entries)+"){if(localStorage.getItem(k)===null)localStorage.setItem(k,v)}window.__zeroDistanceUiMigrationSucceeded=true}catch{}}");
            MarkBoot("uiStorageMigrated");
        }catch(Exception error){Log("ui-storage",error.Message+"；保留旧版记录，下次启动重试");}
        finally{core.DOMContentLoaded-=listener;importingUiStorage=false;}
    }
    async void CommitUiStorage(){
        if(uiStorageCommitted)return;
        if(migrateUiStorage&&migrationScript==null)return;
        try{
            if(migrationScript!=null){
                string done=await browser.CoreWebView2.ExecuteScriptAsync("window.__zeroDistanceUiMigrationSucceeded===true");if(done!="true")return;
                browser.CoreWebView2.RemoveScriptToExecuteOnDocumentCreated(migrationScript);migrationScript=null;
            }
            Json.Atomic(Path.Combine(dataDirectory,"ui-origin-v2.json"),new{version=2,origin=Origin});uiStorageCommitted=true;
        }catch(Exception error){Log("ui-storage",error.Message);}
    }
    async void FinishRenderingWarmup(){try{const int extended=-20,layered=0x80000;int style=GetWindowLong(Handle,extended);if((style&layered)!=0)SetWindowLong(Handle,extended,style&~layered);ApplyMaterial(this,darkTheme);await browser.CoreWebView2.CallDevToolsProtocolMethodAsync("Emulation.setFocusEmulationEnabled","{\"enabled\":false}");}catch(Exception error){Log("render",error.Message);}}
    void RevealMain(bool animated){if(closing)return;prewarming=false;MarkBoot("reveal");try{Json.Atomic(Path.Combine(dataDirectory,"startup-performance.json"),bootTimings);}catch{}splashAssembled=true;ShowInTaskbar=true;if(animated){Opacity=0;Show();Activate();revealClock.Restart();revealTimer.Start();}else{Opacity=1;Show();Activate();FinishRenderingWarmup();}EmitVisibility();}
    void PublishBoot(){if(nativeStartup!=null)nativeStartup.Publish(completedStages,uiReady);else if(uiReady&&!splashAssembled)RevealMain(false);}
    void CloseSplash(){if(nativeStartup!=null)nativeStartup.Dispose();if(splash!=null){splash.Close();splash.Dispose();splash=null;splashBrowser=null;}}
    void RestoreBoundsFromFile(){try{var saved=Json.Parse(File.ReadAllText(Path.Combine(dataDirectory,"window.json")));int w=Math.Max(960,Json.Int(saved,"width",1360)),h=Math.Max(620,Json.Int(saved,"height",860));Size=new Size(w,h);if(Json.Bool(saved,"maximized"))ToggleMaximize();}catch{}}
    async void OnClosing(object sender,FormClosingEventArgs e){
        if(closing)return;
        if(!allowClose){
            if(dirty||busyOwners.Count>0||prefsOwners.Count>0){e.Cancel=true;deferredClose=prefsOwners.Count>0&&!dirty&&busyOwners.Count==0;Emit(browser,"window:skinEditorClose");return;}
            if(mascotPending){e.Cancel=true;Emit(browser,"window:mascotClose");return;}
            e.Cancel=true;allowClose=true;
            if(isMainPage){var bounds=WindowState==FormWindowState.Normal?ClientSize:RestoreBounds.Size;try{Json.Atomic(Path.Combine(dataDirectory,"window.json"),new{width=bounds.Width,height=bounds.Height,maximized=WindowState==FormWindowState.Maximized});}catch{}}
            Hide();CloseSplash();browser.Dispose();await engine.Stop();Close();return;
        }
        closing=true;timer.Stop();revealTimer.Stop();CloseSplash();
    }
    public void EngineEvent(string channel,object[] args){if(IsDisposed||closing)return;try{BeginInvoke(new Action(()=>Emit(browser,channel,args)));}catch{}}
    public void BackendFailed(){if(IsDisposed||closing)return;try{BeginInvoke(new Action(()=>{if(!allowClose){CloseSplash();RevealMain(false);MessageBox.Show(this,"功能后端已退出，请重新打开软件。已有 Minecraft 进程会继续运行。",Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}}));}catch{}}
    public void NativeRequest(object request){
        if(IsDisposed||closing)return;
        try{BeginInvoke(new Action(async()=>{
            object result=null;string error=null;
            try{result=await NativeOperation(Json.Str(request,"operation"),Json.Args(request));}catch(Exception exception){error=exception.Message;}
            try{engine.Write(new{nativeResult=Json.Get(request,"native"),result=result,error=error});}catch{}
        }));}catch{}
    }
    static string Filter(object options){var filters=Json.Get(options,"filters") as object[];if(filters==null)return "所有文件|*.*";var parts=new List<string>();foreach(var filter in filters){var extensions=Json.Get(filter,"extensions") as object[]??new object[0];if(extensions.Length>0){parts.Add(Json.Str(filter,"name").Replace("|"," "));parts.Add(String.Join(";",extensions.Select(e=>"*."+Convert.ToString(e).Replace("|","").Replace(";",""))));}}return parts.Count>0?String.Join("|",parts):"所有文件|*.*";}
    static void OpenExternal(string input){Uri url;if(!Uri.TryCreate(input,UriKind.Absolute,out url)||(url.Scheme!="https"&&url.Scheme!="http")||url.UserInfo!="")throw new Exception("外部链接无效");Process.Start(new ProcessStartInfo(url.AbsoluteUri){UseShellExecute=true});}
    async Task<object> NativeOperation(string operation,object[] args){
        if(!accepted)throw new Exception("尚未同意使用声明");
        if(operation=="dialog:open"){
            var options=args[0];var properties=Json.Get(options,"properties") as object[]??new object[0];
            if(properties.Contains("openDirectory")){using(var dialog=new FolderBrowserDialog{Description=Json.Str(options,"title"),ShowNewFolderButton=true}){if(Directory.Exists(Json.Str(options,"defaultPath")))dialog.SelectedPath=Json.Str(options,"defaultPath");bool ok=dialog.ShowDialog(this)==DialogResult.OK;return new{canceled=!ok,filePaths=ok?new[]{dialog.SelectedPath}:new string[0]};}}
            using(var dialog=new OpenFileDialog{Title=Json.Str(options,"title"),Filter=Filter(options),Multiselect=properties.Contains("multiSelections"),CheckFileExists=true}){string initial=Json.Str(options,"defaultPath");if(Directory.Exists(initial))dialog.InitialDirectory=initial;else if(File.Exists(initial))dialog.FileName=initial;bool ok=dialog.ShowDialog(this)==DialogResult.OK;return new{canceled=!ok,filePaths=ok?dialog.FileNames:new string[0]};}
        }
        if(operation=="dialog:save"){
            var options=args[0];using(var dialog=new SaveFileDialog{Title=Json.Str(options,"title"),Filter=Filter(options),FileName=Json.Str(options,"defaultPath"),OverwritePrompt=true}){bool ok=dialog.ShowDialog(this)==DialogResult.OK;return new{canceled=!ok,filePath=ok?dialog.FileName:null};}
        }
        if(operation=="dialog:error"){MessageBox.Show(this,Convert.ToString(args[1]),Convert.ToString(args[0]),MessageBoxButtons.OK,MessageBoxIcon.Error);return null;}
        if(operation=="dialog:message"){
            var options=args[0];var buttons=Json.Get(options,"buttons") as object[]??new object[]{"确定"};var form=new Form{Text=Json.Str(options,"title"),ClientSize=new Size(500,180),FormBorderStyle=FormBorderStyle.FixedDialog,StartPosition=FormStartPosition.CenterParent,MinimizeBox=false,MaximizeBox=false};
            int response=Json.Int(options,"cancelId",buttons.Length-1);form.Controls.Add(new Label{Text=Json.Str(options,"message")+"\n\n"+Json.Str(options,"detail"),AutoSize=false,Location=new Point(20,20),Size=new Size(460,100)});
            for(int i=0;i<buttons.Length;i++){int index=i;var button=new Button{Text=Convert.ToString(buttons[i]),Location=new Point(485-(buttons.Length-i)*110,135),Size=new Size(105,30)};button.Click+=delegate{response=index;form.Close();};form.Controls.Add(button);}using(form)form.ShowDialog(this);return new{response=response,checkboxChecked=false};
        }
        if(operation=="shell:openExternal"){OpenExternal(Convert.ToString(args[0]));return null;}
        if(operation=="shell:openPath"){
            string file=Path.GetFullPath(Convert.ToString(args[0]));if(!Directory.Exists(file)&&!File.Exists(file))return "路径不存在";
            try{Process.Start(new ProcessStartInfo(file){UseShellExecute=true});return "";}catch(Exception error){return error.Message;}
        }
        if(operation=="shell:showItem"){string file=Path.GetFullPath(Convert.ToString(args[0]));if(file.IndexOf('"')>=0)throw new Exception("路径无效");Process.Start(new ProcessStartInfo("explorer.exe","/select,\""+file+"\""){UseShellExecute=true});return null;}
        if(operation=="shell:trash"){
            string file=Path.GetFullPath(Convert.ToString(args[0]));
            await Task.Run(()=>{if(Directory.Exists(file))FileSystem.DeleteDirectory(file,UIOption.OnlyErrorDialogs,RecycleOption.SendToRecycleBin,UICancelOption.ThrowException);else if(File.Exists(file))FileSystem.DeleteFile(file,UIOption.OnlyErrorDialogs,RecycleOption.SendToRecycleBin,UICancelOption.ThrowException);});return null;
        }
        if(operation=="window:theme"){darkTheme=Convert.ToString(args[0])!="light";ApplyMaterial(this,darkTheme);return null;}
        if(operation=="window:material"){ApplyMaterial(this,darkTheme);return null;}
        if(operation=="window:close"){BeginInvoke(new Action(Close));return null;}
        if(operation=="window:minimize"){WindowState=FormWindowState.Minimized;return null;}
        if(operation=="window:focus"){Show();Activate();return null;}
        if(operation=="app:quit"){BeginInvoke(new Action(Close));return null;}
        if(operation=="files:startDrag"){
            var files=(args[0] as object[]??new object[0]).Select(Convert.ToString).Where(File.Exists).ToArray();if(files.Length==0)return null;var data=new DataObject(DataFormats.FileDrop,files);browser.DoDragDrop(data,DragDropEffects.Copy);return null;
        }
        if(operation=="menu:popup"){
            var entries=args[0] as object[]??new object[0];var completion=new TaskCompletionSource<object>();var menu=new ContextMenuStrip();
            foreach(var entry in entries){if(Json.Str(entry,"type")=="separator"){menu.Items.Add(new ToolStripSeparator());continue;}var value=entry;var item=new ToolStripMenuItem(Json.Str(entry,"label")){Enabled=Json.Get(entry,"enabled")==null||Json.Bool(entry,"enabled")};item.Click+=delegate{completion.TrySetResult(Json.Get(value,"id"));};menu.Items.Add(item);}
            menu.Closed+=delegate{completion.TrySetResult(null);};menu.Show(Cursor.Position);try{return await completion.Task;}finally{menu.Dispose();}
        }
        throw new Exception("尚未实现的原生操作："+operation);
    }
    async void Resource(object sender,CoreWebView2WebResourceRequestedEventArgs e){
        var deferral=e.GetDeferral();
        try{
            try{
                if(e.Request.Method!="GET")throw new Exception("请求未获授权");
                var uri=new Uri(e.Request.Uri);
                if(importingUiStorage&&uri.AbsoluteUri==LegacyStorageUrl){var html=Encoding.UTF8.GetBytes("<!doctype html><html><head><meta charset=\"utf-8\"><title>ZeroDistance</title></head><body></body></html>");e.Response=environment.CreateWebResourceResponse(new MemoryStream(html),200,"OK","Content-Type: text/html; charset=utf-8\r\nContent-Security-Policy: default-src 'none'\r\nCache-Control: no-store");return;}
                if(!accepted||uri.Scheme!="https"||!uri.IsDefaultPort||(uri.Host!="zerodistance-assets.local"&&uri.Host!="zerodistance-plugins.local"))throw new Exception("无效来源");
                object result;
                if(uri.Host=="zerodistance-assets.local"){if(uri.AbsolutePath!="/image")throw new Exception("无效图片请求");var query=System.Web.HttpUtility.ParseQueryString(uri.Query);result=await engine.Invoke("__native:asset",new object[]{query["path"]??""});}
                else{string[] parts=uri.AbsolutePath.Split('/');if(parts.Length!=3||parts[2]!="main.js")throw new Exception("无效插件请求");result=await engine.Invoke("__native:plugin",new object[]{Uri.UnescapeDataString(parts[1])});}
                var bytes=Convert.FromBase64String(Json.Str(result,"data"));e.Response=environment.CreateWebResourceResponse(new MemoryStream(bytes),200,"OK","Content-Type: "+Json.Str(result,"type")+"\r\nAccess-Control-Allow-Origin: "+Origin.TrimEnd('/')+"\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-store");
            }catch(Exception error){Log("asset",error.Message);e.Response=environment.CreateWebResourceResponse(new MemoryStream(new byte[0]),404,"Not Found","Content-Type: text/plain");}
        // Dispose completes the deferred WebView2 event. Calling Complete as
        // well completes it twice and raises E_ILLEGAL_METHOD_CALL.
        }finally{deferral.Dispose();}
    }
}
