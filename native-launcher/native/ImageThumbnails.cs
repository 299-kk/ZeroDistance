using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

internal static class ImageThumbnails {
    static readonly SemaphoreSlim Queue=new SemaphoreSlim(1,1);
    public static async Task<string> Get(string source,string profile,int bound){
        if(bound<32||bound>512)return source;
        // GDI+ does not universally decode WebP. Shipped WebP images have static thumbnails.
        if(Path.GetExtension(source).Equals(".webp",StringComparison.OrdinalIgnoreCase))return source;
        var info=new FileInfo(source);string key;
        using(var sha=SHA256.Create())key=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(source+"|"+info.Length+"|"+info.LastWriteTimeUtc.Ticks+"|"+bound))).Replace("-","").ToLowerInvariant();
        string cache=Path.Combine(profile,"image-thumbnails"),dest=Path.Combine(cache,key+".png");UpdatePackage.Plain(dest);
        if(File.Exists(dest))return dest;
        await Queue.WaitAsync();
        try{return await Task.Run(()=>{
            if(File.Exists(dest))return dest;Directory.CreateDirectory(cache);
            try{
                using(var input=new FileStream(source,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))using(var image=Image.FromStream(input,true,true)){
                    if(image.Width<1||image.Height<1||(long)image.Width*image.Height>16*1024*1024)return source;
                    double scale=Math.Min(1,(double)bound/Math.Max(image.Width,image.Height));
                    using(var bitmap=new Bitmap(Math.Max(1,(int)(image.Width*scale)),Math.Max(1,(int)(image.Height*scale)))){
                        using(var graphics=Graphics.FromImage(bitmap)){graphics.CompositingMode=CompositingMode.SourceCopy;graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;graphics.DrawImage(image,0,0,bitmap.Width,bitmap.Height);}
                        string temp=dest+".tmp";bitmap.Save(temp,ImageFormat.Png);File.Move(temp,dest);
                    }
                }
                foreach(var old in new DirectoryInfo(cache).GetFiles("*.png").OrderByDescending(f=>f.LastWriteTimeUtc).Skip(128))try{if((old.Attributes&FileAttributes.ReparsePoint)==0)old.Delete();}catch{}
                return dest;
            }catch(ArgumentException){return source;}
        });}finally{Queue.Release();}
    }
}
