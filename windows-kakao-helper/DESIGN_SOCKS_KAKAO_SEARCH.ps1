param([Parameter(Mandatory=$true,Position=0)][string]$RequestUri)
$ErrorActionPreference='Stop'
$appDir=Join-Path $env:LOCALAPPDATA 'DesignSocksKakao';$logPath=Join-Path $appDir 'helper.log'
New-Item -ItemType Directory -Path $appDir -Force|Out-Null
function Log([string]$m){Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff') $m" -Encoding UTF8}
try{
 Log 'START V6.7.86';Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Web;Add-Type -AssemblyName UIAutomationClient;Add-Type -AssemblyName UIAutomationTypes
 Add-Type @'
using System;using System.Collections.Generic;using System.Diagnostics;using System.Runtime.InteropServices;using System.Text;
public static class DSW{
[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int n);
[DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]static extern bool BringWindowToTop(IntPtr h);[DllImport("user32.dll")]static extern IntPtr SetActiveWindow(IntPtr h);[DllImport("user32.dll")]static extern IntPtr SetFocus(IntPtr h);[DllImport("user32.dll")]static extern bool AttachThreadInput(uint a,uint b,bool attach);[DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();[DllImport("user32.dll")]static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
[DllImport("user32.dll")]static extern bool EnumWindows(EnumProc cb,IntPtr p);[DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
[DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out RECT r);delegate bool EnumProc(IntPtr h,IntPtr p);struct RECT{public int Left,Top,Right,Bottom;}
[DllImport("user32.dll")]static extern bool EnumChildWindows(IntPtr h,EnumProc cb,IntPtr p);[DllImport("user32.dll")]static extern int GetDlgCtrlID(IntPtr h);[DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll")]static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
[DllImport("user32.dll")]static extern bool GetClientRect(IntPtr h,out RECT r);[DllImport("user32.dll")]static extern bool ClientToScreen(IntPtr h,ref POINT p);[DllImport("user32.dll")]static extern bool GetCursorPos(out POINT p);[DllImport("user32.dll")]static extern uint GetDpiForWindow(IntPtr h);[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool SetWindowText(IntPtr h,string text);
[DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
[DllImport("user32.dll")]static extern bool SetProcessDPIAware();
struct POINT{public int X, Y;}
public static string Candidates="";
public static IntPtr MainHandle=IntPtr.Zero;public static IntPtr ChatListHandle=IntPtr.Zero;
public static void EnableDpiAwareness(){try{SetProcessDPIAware();}catch{}}
public static bool ForceForeground(IntPtr h){ShowWindowAsync(h,9);uint targetPid,fgPid;uint targetThread=GetWindowThreadProcessId(h,out targetPid);IntPtr fg=GetForegroundWindow();uint fgThread=GetWindowThreadProcessId(fg,out fgPid);uint cur=GetCurrentThreadId();try{if(cur!=targetThread)AttachThreadInput(cur,targetThread,true);if(fgThread!=0&&fgThread!=cur&&fgThread!=targetThread)AttachThreadInput(cur,fgThread,true);keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);BringWindowToTop(h);SetForegroundWindow(h);SetActiveWindow(h);SetFocus(h);}finally{if(fgThread!=0&&fgThread!=cur&&fgThread!=targetThread)AttachThreadInput(cur,fgThread,false);if(cur!=targetThread)AttachThreadInput(cur,targetThread,false);}IntPtr now=GetForegroundWindow();uint nowPid;GetWindowThreadProcessId(now,out nowPid);return now==h||nowPid==targetPid;}
public static bool FocusChatList(){IntPtr h=ChatListHandle!=IntPtr.Zero?ChatListHandle:MainHandle;if(h==IntPtr.Zero)return false;uint pid;uint targetThread=GetWindowThreadProcessId(h,out pid);uint cur=GetCurrentThreadId();try{if(cur!=targetThread)AttachThreadInput(cur,targetThread,true);SetActiveWindow(MainHandle);SetFocus(h);return true;}finally{if(cur!=targetThread)AttachThreadInput(cur,targetThread,false);}}
public static bool ClickScreenPoint(int x,int y){if(x<0||y<0)return false;if(!SetCursorPos(x,y))return false;mouse_event(0x0002,0,0,0,UIntPtr.Zero);mouse_event(0x0004,0,0,0,UIntPtr.Zero);return true;}
public static bool PostCtrlFToKakao(){IntPtr h=ChatListHandle!=IntPtr.Zero?ChatListHandle:MainHandle;if(h==IntPtr.Zero)return false;const uint DOWN=0x0100,UP=0x0101;PostMessage(h,DOWN,(IntPtr)0x11,IntPtr.Zero);PostMessage(h,DOWN,(IntPtr)0x46,IntPtr.Zero);PostMessage(h,UP,(IntPtr)0x46,IntPtr.Zero);PostMessage(h,UP,(IntPtr)0x11,IntPtr.Zero);if(h!=MainHandle){PostMessage(MainHandle,DOWN,(IntPtr)0x11,IntPtr.Zero);PostMessage(MainHandle,DOWN,(IntPtr)0x46,IntPtr.Zero);PostMessage(MainHandle,UP,(IntPtr)0x46,IntPtr.Zero);PostMessage(MainHandle,UP,(IntPtr)0x11,IntPtr.Zero);}return true;}
public static string ClickKakaoSearch(){if(MainHandle==IntPtr.Zero)return "NO_MAIN";RECT r;if(!GetClientRect(MainHandle,out r))return "NO_RECT";int w=r.Right-r.Left,hh=r.Bottom-r.Top;if(w<320||w>1800||hh<420)return "BAD_SIZE w="+w+" h="+hh;uint dpi=96;try{dpi=GetDpiForWindow(MainHandle);if(dpi<96||dpi>384)dpi=96;}catch{}/* GetClientRect already returns the coordinate space expected by ClientToScreen. Do not scale it again. */int x=w-185,y=55;if(x<80||y<20)return "BAD_COORD";POINT p=new POINT{X=x,Y=y},old;if(!ClientToScreen(MainHandle,ref p))return "NO_SCREEN_POINT";GetCursorPos(out old);if(!ClickScreenPoint(p.X,p.Y))return "CLICK_FAILED";System.Threading.Thread.Sleep(120);SetCursorPos(old.X,old.Y);return "client="+x+","+y+" screen="+p.X+","+p.Y+" w="+w+" h="+hh+" dpi="+dpi;}
public static IntPtr FindKakaoMainWindow(){MainHandle=IntPtr.Zero;ChatListHandle=IntPtr.Zero;IntPtr best=IntPtr.Zero,bestChat=IntPtr.Zero;int bestScore=-99999;var rows=new List<string>();EnumWindows(delegate(IntPtr h,IntPtr p){uint pid;GetWindowThreadProcessId(h,out pid);string proc="";try{proc=Process.GetProcessById((int)pid).ProcessName;}catch{return true;}if(proc.IndexOf("kakao",StringComparison.OrdinalIgnoreCase)<0)return true;
 var b=new StringBuilder(512);GetWindowText(h,b,b.Capacity);string title=b.ToString().Trim();RECT r;GetWindowRect(h,out r);int w=r.Right-r.Left,hh=r.Bottom-r.Top;bool visible=IsWindowVisible(h);int score=0;IntPtr chat=IntPtr.Zero;var marks=new List<string>();
 EnumChildWindows(h,delegate(IntPtr c,IntPtr q){int id=GetDlgCtrlID(c);var cn=new StringBuilder(256);GetClassName(c,cn,cn.Capacity);string cls=cn.ToString();if(id==1150){score+=12000;chat=c;marks.Add("chatList1150");}else if(id==132){score+=4000;marks.Add("mainView132");}else if(id==1003){score+=3000;marks.Add("searchList1003");}if(cls.IndexOf("OnlineMainView",StringComparison.OrdinalIgnoreCase)>=0){score+=4000;marks.Add("onlineMainView");}return true;},IntPtr.Zero);
 if(title=="카카오톡"||title.Equals("KakaoTalk",StringComparison.OrdinalIgnoreCase))score+=10000;else if(title.IndexOf("카카오톡",StringComparison.OrdinalIgnoreCase)>=0||title.IndexOf("KakaoTalk",StringComparison.OrdinalIgnoreCase)>=0)score+=5000;
 if(w>=280&&w<=900)score+=500;if(hh>=450)score+=100;if(!visible)score-=20000;rows.Add("handle="+h+" visible="+visible+" title=["+title+"] size="+w+"x"+hh+" score="+score+" marks="+String.Join(",",marks.ToArray()));
 if(score>bestScore){bestScore=score;best=h;bestChat=chat;}return true;},IntPtr.Zero);Candidates=String.Join(" | ",rows.ToArray());if(bestScore>=5000){MainHandle=best;ChatListHandle=bestChat;return best;}return IntPtr.Zero;}
}
'@
 [DSW]::EnableDpiAwareness();Log 'DPI AWARE ENABLED'
 $uri=[Uri]$RequestUri;if($uri.Scheme-ne'designsocks-kakao'-or$uri.Host-ne'search'){throw '지원하지 않는 요청입니다.'}
 $q=[System.Web.HttpUtility]::ParseQueryString($uri.Query);$name=([string]$q['name']).Trim();$name=($name-replace'[\x00-\x1F\x7F]',' ')
 if([string]::IsNullOrWhiteSpace($name)){throw '검색할 거래처명이 없습니다.'};if($name.Length-gt100){$name=$name.Substring(0,100)};Log "QUERY=$name"
 $handle=[DSW]::FindKakaoMainWindow();Log "WINDOWS=$([DSW]::Candidates)"
 if($handle-eq[IntPtr]::Zero){throw '카카오톡 메인창을 찾지 못했습니다. 카카오톡 메인 목록 창을 직접 열어둔 뒤 다시 눌러주세요.'};Log "MAIN HANDLE=$handle"
 if(-not[DSW]::ForceForeground($handle)){throw '카카오톡을 키보드 입력 창으로 전환하지 못했습니다. 카카오톡 메인창을 화면에 열어둔 뒤 다시 눌러주세요.'};Log 'FOREGROUND VERIFIED';Start-Sleep -Milliseconds 350
 # 남아 있는 친구추가/검색 팝업만 닫고 채팅목록으로 전환합니다.
 # Ctrl+F는 이 카카오톡 버전에서 친구 추가를 열 수 있어 절대 사용하지 않습니다.
 [System.Windows.Forms.SendKeys]::SendWait('{ESC}');Start-Sleep -Milliseconds 120
 [System.Windows.Forms.SendKeys]::SendWait('^2');Log 'CLOSE STALE POPUP AND CHAT LIST CTRL+2';Start-Sleep -Milliseconds 400
 if(-not[DSW]::ForceForeground($handle)){throw '카카오톡 채팅목록을 전면으로 유지하지 못했습니다.'}
 $searchClick=[DSW]::ClickKakaoSearch();Log "CHAT SEARCH ICON CLICK $searchClick"
 if($searchClick-like'BAD*'-or$searchClick-like'NO_*'){throw "카카오톡 검색 버튼 위치를 안전하게 계산하지 못했습니다: $searchClick"}
 Start-Sleep -Milliseconds 500
 [System.Windows.Forms.Clipboard]::SetText($name)
 [System.Windows.Forms.SendKeys]::SendWait('^a');Start-Sleep -Milliseconds 80
 [System.Windows.Forms.SendKeys]::SendWait('^v');Start-Sleep -Milliseconds 500
 Log 'CHAT SEARCH NAME PASTED AFTER DPI-SAFE RELATIVE SEARCH CLICK'
 Log 'DONE HUMAN CONFIRMATION REQUIRED'
}catch{Log "ERROR=$($_.Exception.ToString())";try{Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue;[System.Windows.Forms.MessageBox]::Show("카톡 찾기 실패:`n$($_.Exception.Message)`n`n진단기록:`n$logPath",'DESIGN SOCKS 카톡 찾기','OK','Error')|Out-Null}catch{};exit 1}
