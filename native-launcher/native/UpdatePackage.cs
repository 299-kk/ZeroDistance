using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

internal static class UpdatePackage {
    static JavaScriptSerializer Serializer(){return new JavaScriptSerializer{MaxJsonLength=512000};}
    public static object Parse(string text){return Serializer().DeserializeObject(text);}
    public static string Encode(object value){return Serializer().Serialize(value);}
    public static object Get(object value,string key){object result;var map=value as Dictionary<string,object>;return map!=null&&map.TryGetValue(key,out result)?result:null;}
    public static string Str(object value,string key){return Convert.ToString(Get(value,key))??"";}
    public static string Sha(Stream input){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(input)).Replace("-","").ToLowerInvariant();}
    public static string Sha(string file){using(var input=File.OpenRead(file))return Sha(input);}
    public static object Read(string file){Plain(file);if(new FileInfo(file).Length>512000)throw new Exception("更新记录过大");return Parse(File.ReadAllText(file));}
    public static FileStream VerifiedZip(string file,object asset){
        Plain(file);var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read);
        try{if(stream.Length!=Convert.ToInt64(Get(asset,"size"))||Sha(stream)!=Str(asset,"sha256"))throw new Exception("更新包完整性校验失败");stream.Position=0;return stream;}catch{stream.Dispose();throw;}
    }
    public static Version VersionOf(string value){Version parsed;if(value.Length>32||!System.Text.RegularExpressions.Regex.IsMatch(value,@"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\z")||!Version.TryParse(value,out parsed))throw new Exception("更新版本号无效");return parsed;}
    public static string HelperHash(){using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("update-helper.sha256"))using(var reader=new StreamReader(stream))return reader.ReadToEnd().Trim();}
    public static FileStream TrustedHelper(string app,string job){
        string source=Under(Path.Combine(app,"UpdateHelper.exe"),app),dest=Under(Path.Combine(job,"UpdateHelper.exe"),job),expected=HelperHash();
        if(File.Exists(dest)){var existing=new FileStream(dest,FileMode.Open,FileAccess.Read,FileShare.Read);if(Sha(existing)==expected)return existing;existing.Dispose();}
        using(var input=new FileStream(source,FileMode.Open,FileAccess.Read,FileShare.Read)){
            if(Sha(input)!=expected)throw new Exception("更新助手与程序内置信任值不符");input.Position=0;
            if(File.Exists(dest))File.Delete(dest);using(var output=new FileStream(dest,FileMode.CreateNew,FileAccess.Write,FileShare.None))input.CopyTo(output);
        }
        var verified=new FileStream(dest,FileMode.Open,FileAccess.Read,FileShare.Read);try{if(Sha(verified)!=expected)throw new Exception("临时更新助手校验失败");return verified;}catch{verified.Dispose();throw;}
    }
    public static string KeyXml(){using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("update-trust.json"))using(var reader=new StreamReader(stream))return Str(Parse(reader.ReadToEnd()),"publicXml");}
    public static object Verify(object envelope,string qaKey){
        string payload=Str(envelope,"payload"),signature=Str(envelope,"signature");if(payload.Length>200000||signature.Length>2048)throw new Exception("更新签名数据过大");
        byte[] bytes=Convert.FromBase64String(payload);
        using(var rsa=new RSACryptoServiceProvider()){rsa.PersistKeyInCsp=false;rsa.FromXmlString(qaKey??KeyXml());if(!rsa.VerifyData(bytes,CryptoConfig.MapNameToOID("SHA256"),Convert.FromBase64String(signature)))throw new Exception("更新签名不匹配");}
        var p=Parse(Encoding.UTF8.GetString(bytes));string version=Str(p,"version"),name="ZeroDistance-"+version+"-windows-x64.zip";var a=Get(p,"asset");long size;
        VersionOf(version);
        if(Convert.ToString(Get(p,"format"))!="1"||Str(p,"product")!="ZeroDistance"||Str(p,"platform")!="win32-x64"||Str(a,"name")!=name||Str(a,"url")!="https://github.com/299-kk/ZeroDistance/releases/download/v"+version+"/"+name||!System.Text.RegularExpressions.Regex.IsMatch(Str(a,"sha256"),"^[a-f0-9]{64}$")||!Int64.TryParse(Convert.ToString(Get(a,"size")),out size)||size<=0||size>100000000)throw new Exception("更新清单来源无效");
        return p;
    }
    public static string Under(string file,string root){string full=Path.GetFullPath(file),parent=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;if(!full.StartsWith(parent,StringComparison.OrdinalIgnoreCase))throw new Exception("更新路径越界");Plain(full);return full;}
    public static void Plain(string file){for(string cursor=Path.GetFullPath(file);!String.IsNullOrEmpty(cursor);cursor=Path.GetDirectoryName(cursor)){if((File.Exists(cursor)||Directory.Exists(cursor))&&(File.GetAttributes(cursor)&FileAttributes.ReparsePoint)!=0)throw new Exception("更新路径不能包含目录链接");}}
    public static void Save(string file,object value){Plain(file);Directory.CreateDirectory(Path.GetDirectoryName(file));string temp=file+"."+Guid.NewGuid().ToString("N")+".tmp";try{using(var output=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(output,new UTF8Encoding(false)))writer.Write(Encode(value));Plain(file);if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);}finally{if(File.Exists(temp))File.Delete(temp);}}
}
