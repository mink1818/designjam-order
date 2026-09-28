$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Collections.Generic;using System.Diagnostics;using System.Runtime.InteropServices;using System.Text;
public static class KakaoDiag{
[DllImport("user32.dll")]static extern bool EnumWindows(EnumProc cb,IntPtr p);[DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);[DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out RECT r);delegate bool EnumProc(IntPtr h,IntPtr p);struct RECT{public int Left,Top,Right,Bottom;}
public static string[] FindAll(){var rows=new List<string>();EnumWindows(delegate(IntPtr h,IntPtr p){uint pid;GetWindowThreadProcessId(h,out pid);try{var pr=Process.GetProcessById((int)pid);if(pr.ProcessName.IndexOf("kakao",StringComparison.OrdinalIgnoreCase)<0)return true;var b=new StringBuilder(512);GetWindowText(h,b,b.Capacity);RECT r;GetWindowRect(h,out r);rows.Add(h+"\t"+IsWindowVisible(h)+"\t"+b.ToString().Replace("\t"," ")+"\t"+r.Left+"\t"+r.Top+"\t"+(r.Right-r.Left)+"\t"+(r.Bottom-r.Top));}catch{}return true;},IntPtr.Zero);return rows.ToArray();}}
'@
$desktop=[Environment]::GetFolderPath('Desktop')
$folder=Join-Path $desktop 'KAKAO_DIAGNOSTIC_ALL'
$zip=Join-Path $desktop 'KAKAO_DIAGNOSTIC_ALL.zip'
try{
 New-Item -ItemType Directory -Path $folder -Force|Out-Null
 $lines=New-Object System.Collections.Generic.List[string]
 $lines.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
 $index=0
 foreach($row in [KakaoDiag]::FindAll()){
  $parts=$row.Split([char]9);$h=[IntPtr]([long]$parts[0]);$visible=[bool]::Parse($parts[1]);$title=$parts[2];$x=[int]$parts[3];$y=[int]$parts[4];$w=[int]$parts[5];$height=[int]$parts[6]
  $lines.Add("");$lines.Add("=== WINDOW $index ===");$lines.Add("Handle=[$h] Visible=[$visible] Title=[$title] Rect=[$x,$y,$w,$height]")
  if($visible-and$w-gt40-and$height-gt40-and$x-gt-10000-and$y-gt-10000){
   try{$bmp=New-Object System.Drawing.Bitmap($w,$height);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.CopyFromScreen($x,$y,0,0,$bmp.Size);$shot=Join-Path $folder ("window_{0}_{1}x{2}.png"-f $index,$w,$height);$bmp.Save($shot,[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$bmp.Dispose()}catch{$lines.Add("ScreenshotError=[$($_.Exception.Message)]")}
  }
  try{$root=[System.Windows.Automation.AutomationElement]::FromHandle($h);$lines.Add("Root Name=[$($root.Current.Name)] Class=[$($root.Current.ClassName)] Id=[$($root.Current.AutomationId)]");$all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);foreach($e in $all){try{$r=$e.Current.BoundingRectangle;$lines.Add("Type=[$($e.Current.ControlType.ProgrammaticName)] Name=[$($e.Current.Name)] Id=[$($e.Current.AutomationId)] Class=[$($e.Current.ClassName)] Enabled=[$($e.Current.IsEnabled)] Offscreen=[$($e.Current.IsOffscreen)] Rect=[$([int]$r.X),$([int]$r.Y),$([int]$r.Width),$([int]$r.Height)]")}catch{}}}catch{$lines.Add("UIAError=[$($_.Exception.Message)]")}
  $index++
 }
 if($index-eq0){throw 'Kakao window not found. Open and log in to KakaoTalk first.'}
 $lines|Set-Content -LiteralPath (Join-Path $folder 'KAKAO_UI_ALL.txt') -Encoding UTF8
 if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip -Force}
 Compress-Archive -Path (Join-Path $folder '*') -DestinationPath $zip -Force
 Add-Type -AssemblyName System.Windows.Forms
 $msg='진단 완료'+[Environment]::NewLine+[Environment]::NewLine+'바탕화면의 KAKAO_DIAGNOSTIC_ALL.zip 파일을 보내주세요.'
 [System.Windows.Forms.MessageBox]::Show($msg,'DESIGN SOCKS 카톡 찾기','OK','Information')|Out-Null
}catch{Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.MessageBox]::Show("진단 실패: $($_.Exception.Message)",'DESIGN SOCKS 카톡 찾기','OK','Error')|Out-Null;exit 1}
