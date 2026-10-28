using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Json {
    public static JavaScriptSerializer Serializer(){return new JavaScriptSerializer{MaxJsonLength=160*1024*1024,RecursionLimit=96};}
    public static object Parse(string value){return Serializer().DeserializeObject(value);}
    public static string Stringify(object value){return Serializer().Serialize(value);}
    public static Dictionary<string,object> Map(object value){return value as Dictionary<string,object>??new Dictionary<string,object>();}
    public static object Get(object value,string key){object result;return Map(value).TryGetValue(key,out result)?result:null;}
    public static string Str(object value,string key){return Convert.ToString(Get(value,key))??"";}
    public static bool Bool(object value,string key){return Get(value,key) is bool&&(bool)Get(value,key);}
    public static int Int(object value,string key,int fallback){int result;return Int32.TryParse(Str(value,key),out result)?result:fallback;}
    public static object[] Args(object value){return Get(value,"args") as object[]??new object[0];}
    public static void Atomic(string file,object value){
        Directory.CreateDirectory(Path.GetDirectoryName(file));string temp=file+"."+Guid.NewGuid().ToString("N")+".tmp";
        try{File.WriteAllText(temp,Stringify(value),new UTF8Encoding(false));if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);}finally{if(File.Exists(temp))File.Delete(temp);}
    }
}
internal static class Program {
    static void ReportFailure(string[] args,Exception error){
        string data=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"ZeroDistance-Native");
        int index=Array.IndexOf(args,"--data-dir");
        if(Array.IndexOf(args,"--qa")>=0&&index>=0&&index+1<args.Length){string candidate=Path.GetFullPath(args[index+1]);if(Array.IndexOf(candidate.Split(Path.DirectorySeparatorChar),".qa")>=0)data=candidate;}
        string log=Path.Combine(data,"native-unhandled.log");
        try{Directory.CreateDirectory(data);File.AppendAllText(log,DateTime.UtcNow.ToString("o")+Environment.NewLine+error+Environment.NewLine,new UTF8Encoding(false));}catch{}
        MessageBox.Show("ZeroDistance 遇到异常，请重新打开。\n\n"+error.Message+"\n\n详细记录："+log,"ZeroDistance",MessageBoxButtons.OK,MessageBoxIcon.Error);
    }
    [STAThread] static void Main(string[] args){
        AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);
        if(Array.IndexOf(args,"--native-service")>=0){
            using(var input=new StreamReader(Console.OpenStandardInput(),Encoding.UTF8))using(var output=new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false))){
                try{string text=input.ReadToEnd();if(text.Length>96*1024*1024)throw new Exception("请求过大");var request=Json.Parse(text);output.Write(Json.Stringify(new {result=NativeServices.Execute(Json.Str(request,"operation"),Json.Args(request))}));}
                catch(Exception error){output.Write(Json.Stringify(new {error=error.Message}));}
            }return;
        }
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        if(UpdateBootstrap.TryStart(LauncherWindow.CurrentAppVersion,args))return;
        try{Application.Run(new LauncherWindow(args));if(Environment.ExitCode==0)UpdateBootstrap.TryStart(LauncherWindow.CurrentAppVersion,args,true);}
        catch(Exception error){ReportFailure(args,error);Environment.ExitCode=1;}
    }
}
