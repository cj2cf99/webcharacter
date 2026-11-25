param([int]$ParentProcessId,[int]$ExcludeProcessId)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class PetWindowInfo {
 public string id; public int pid; public int x,y,width,height; public bool minimized,maximized,eligible,overlay;
}
public class PetWindows {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] private struct LastInput {public uint size,tick;}
 [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LastInput info);
 [DllImport("kernel32.dll")] private static extern ulong GetTickCount64();
 private static readonly long bootMs=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-(long)GetTickCount64();
 // 只传最近输入的时间，不采集按键、文字或鼠标按钮内容。
 public static long LastInputAt() {
  var info=new LastInput{size=(uint)Marshal.SizeOf(typeof(LastInput))};
  if(!GetLastInputInfo(ref info))return 0;
  ulong uptime=GetTickCount64();
  return bootMs+(long)uptime-unchecked((uint)uptime-info.tick);
 }
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc fn,IntPtr p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out int pid);
 [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool GetLayeredWindowAttributes(IntPtr h,out uint color,out byte alpha,out uint flags);
 private const int Layered=0x80000, Transparent=0x20, ToolWindow=0x80, TopMost=0x8;
 private const uint AlphaFlag=2, QueryLimitedInfo=0x1000;
 [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] private static extern bool QueryFullProcessImageName(IntPtr h,int flags,StringBuilder buf,ref int size);
 [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr h);
 private static string ProcessName(int pid,Dictionary<int,string> cache) {
  string name;if(cache.TryGetValue(pid,out name))return name;
  IntPtr h=OpenProcess(QueryLimitedInfo,false,pid);
  if(h!=IntPtr.Zero){
   try{
    var sb=new StringBuilder(260);int sz=sb.Capacity;
    if(QueryFullProcessImageName(h,0,sb,ref sz))name=System.IO.Path.GetFileNameWithoutExtension(sb.ToString());
   }finally{CloseHandle(h);}
  }
  cache[pid]=name??"";return cache[pid];
 }
 private static bool IsScreenshotOverlay(int pid,int ex,Dictionary<int,string> cache) {
  string proc=ProcessName(pid,cache);
  if(string.Equals(proc,"ScreenClippingHost",StringComparison.OrdinalIgnoreCase))return true;
  return string.Equals(proc,"SnippingTool",StringComparison.OrdinalIgnoreCase)&&(ex&(TopMost|ToolWindow))!=0;
 }
 private static bool IsTransparentOverlay(IntPtr h,int style) {
  if((style&Layered)==0)return false;
  if((style&(Transparent|ToolWindow))==(Transparent|ToolWindow))return true;
  uint color,flags;byte alpha;
  return GetLayeredWindowAttributes(h,out color,out alpha,out flags)&&(flags&AlphaFlag)!=0&&alpha==0;
 }
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint cmd);
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int attr,out int value,int size);
 [DllImport("dwmapi.dll",EntryPoint="DwmGetWindowAttribute")] public static extern int Frame(IntPtr h,int attr,out Rect value,int size);
 public static PetWindowInfo[] Read(int excluded) {
  var list=new List<PetWindowInfo>();
  var procNames=new Dictionary<int,string>();
  EnumWindows((h,p)=>{
   if(!IsWindowVisible(h))return true;
   int pid;GetWindowThreadProcessId(h,out pid);if(pid==excluded)return true;
   int cloaked=0;DwmGetWindowAttribute(h,14,out cloaked,4);if(cloaked!=0)return true;
   var cls=new StringBuilder(256);GetClassName(h,cls,256);string name=cls.ToString();
   if(name=="#32768"||name=="Progman"||name=="WorkerW"||name=="Shell_TrayWnd"||name=="Shell_SecondaryTrayWnd")return true;
   Rect rect;if(Frame(h,9,out rect,16)!=0&&!GetWindowRect(h,out rect))return true;
   int w=rect.Right-rect.Left,ht=rect.Bottom-rect.Top;if(w<=0||ht<=0)return true;
   int ex=GetWindowLong(h,-20);
   if(IsTransparentOverlay(h,ex))return true;
   bool overlay=IsScreenshotOverlay(pid,ex,procNames);
   bool eligible=!overlay&&(ex&ToolWindow)==0&&GetWindow(h,4)==IntPtr.Zero&&w>=120&&ht>=100;
   list.Add(new PetWindowInfo{id=h.ToInt64().ToString(),pid=pid,x=rect.Left,y=rect.Top,width=w,height=ht,minimized=IsIconic(h),maximized=IsZoomed(h),eligible=eligible,overlay=overlay});return true;
  },IntPtr.Zero);return list.ToArray();
 }
}
"@
[void][PetWindows]::SetProcessDpiAwarenessContext([IntPtr](-4))
while(Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue){
 $data=@{lastInputAt=[PetWindows]::LastInputAt();foreground=[PetWindows]::GetForegroundWindow().ToInt64().ToString();windows=@([PetWindows]::Read($ExcludeProcessId))}
 [Console]::WriteLine(($data|ConvertTo-Json -Compress -Depth 4))
 Start-Sleep -Milliseconds 50
}
