using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

internal static class NativeServices {
    static byte[] Bytes(object value){return Convert.FromBase64String(Convert.ToString(value));}
    static byte[] Png(Image image){using(var stream=new MemoryStream()){image.Save(stream,ImageFormat.Png);return stream.ToArray();}}
    static object Empty(){return new {width=0,height=0,png=""};}
    static void Dimensions(int width,int height){if(width<=0||height<=0||width>16384||height>16384||(long)width*height>16*1024*1024)throw new Exception("图片尺寸超过限制");}
    static byte[] BitmapBytes(Bitmap image){
        var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
        try{var result=new byte[image.Width*image.Height*4];for(int y=0;y<image.Height;y++)Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),result,y*image.Width*4,image.Width*4);return result;}finally{image.UnlockBits(data);}
    }
    static object ImageResult(Bitmap image,object options){
        object bitmap=Json.Bool(options,"bitmap")?Convert.ToBase64String(BitmapBytes(image)):null;
        string jpeg=null;
        if(Json.Get(options,"jpeg")!=null){
            var codec=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.FormatID==ImageFormat.Jpeg.Guid);
            using(var stream=new MemoryStream())using(var parameters=new EncoderParameters(1)){
                parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,(long)Math.Max(1,Math.Min(100,Json.Int(options,"jpeg",88))));image.Save(stream,codec,parameters);jpeg=Convert.ToBase64String(stream.ToArray());
            }
        }
        return new {width=image.Width,height=image.Height,png=Convert.ToBase64String(Png(image)),bitmap=bitmap,jpeg=jpeg};
    }
    public static object Execute(string operation,object[] args){
        if(operation=="secret:encrypt"){
            string plain=Convert.ToString(args[0]);if(plain.Length>4*1024*1024)throw new Exception("凭据过大");
            var cipher=ProtectedData.Protect(Encoding.UTF8.GetBytes(plain),null,DataProtectionScope.CurrentUser);var result=new byte[cipher.Length+3];Encoding.ASCII.GetBytes("ZD1").CopyTo(result,0);cipher.CopyTo(result,3);return Convert.ToBase64String(result);
        }
        if(operation=="secret:decrypt"){
            var cipher=Bytes(args[0]);if(cipher.Length<4)throw new Exception("凭据无效");string prefix=Encoding.ASCII.GetString(cipher,0,3);
            if(prefix!="ZD1"&&prefix!="v10")throw new Exception("不支持的凭据格式");
            var body=new byte[cipher.Length-3];Array.Copy(cipher,3,body,0,body.Length);return Encoding.UTF8.GetString(ProtectedData.Unprotect(body,null,DataProtectionScope.CurrentUser));
        }
        if(operation=="image:bitmap"){
            var options=args[1];int width=Json.Int(options,"width",0),height=Json.Int(options,"height",0);Dimensions(width,height);var pixels=Bytes(args[0]);if(pixels.Length!=width*height*4)throw new Exception("位图大小无效");
            using(var bitmap=new Bitmap(width,height,PixelFormat.Format32bppArgb)){
                var data=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
                try{for(int y=0;y<height;y++)Marshal.Copy(pixels,y*width*4,IntPtr.Add(data.Scan0,y*data.Stride),width*4);}finally{bitmap.UnlockBits(data);}
                return ImageResult(bitmap,null);
            }
        }
        if(operation=="image:decode"||operation=="image:convert"){
            var bytes=Bytes(args[0]);if(bytes.Length>32*1024*1024)throw new Exception("图片文件过大");
            try{using(var stream=new MemoryStream(bytes))using(var image=Image.FromStream(stream,true,true)){
                Dimensions(image.Width,image.Height);object options=args.Length>1?args[1]:null;
                int width=Json.Int(options,"width",0),height=Json.Int(options,"height",0);
                if(width<=0)width=height>0?Math.Max(1,(int)Math.Round((double)image.Width*height/image.Height)):image.Width;
                if(height<=0)height=Math.Max(1,(int)Math.Round((double)image.Height*width/image.Width));
                var crop=Json.Get(options,"crop");Rectangle source=new Rectangle(0,0,image.Width,image.Height);
                if(crop!=null){source=new Rectangle(Json.Int(crop,"x",0),Json.Int(crop,"y",0),Json.Int(crop,"width",0),Json.Int(crop,"height",0));if(!new Rectangle(0,0,image.Width,image.Height).Contains(source)||source.Width<=0||source.Height<=0)throw new Exception("裁剪范围无效");width=source.Width;height=source.Height;}
                Dimensions(width,height);
                using(var bitmap=new Bitmap(width,height,PixelFormat.Format32bppArgb)){
                    using(var graphics=Graphics.FromImage(bitmap)){graphics.CompositingMode=CompositingMode.SourceCopy;graphics.InterpolationMode=width==source.Width&&height==source.Height?InterpolationMode.NearestNeighbor:InterpolationMode.HighQualityBicubic;graphics.PixelOffsetMode=PixelOffsetMode.Half;graphics.DrawImage(image,new Rectangle(0,0,width,height),source,GraphicsUnit.Pixel);}
                    return ImageResult(bitmap,options);
                }
            }}catch(ArgumentException){if(operation=="image:decode")return Empty();throw;}
        }
        throw new Exception("未知原生服务");
    }
}
