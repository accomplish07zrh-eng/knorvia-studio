// 独立夹具仅提供测试状态，不引用或打包旧原生操作驱动。
export const fixtureSource = String.raw`
using System; using System.Drawing; using System.IO; using System.Text;
using System.Threading; using System.Runtime.InteropServices;
using System.Web.Script.Serialization; using System.Windows.Forms;
internal sealed class ScrollList : ListBox {
  public int WheelEvents;
  public Point LastWheelPoint {get;private set;}
  protected override void WndProc(ref Message message) {
    if(message.Msg==0x020A){WheelEvents++;LastWheelPoint=System.Windows.Forms.Cursor.Position;}
    base.WndProc(ref message);
  }
}
internal static class Fixture {
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int L,T,R,B; }
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window,int key,out Rect value,int size);
  [STAThread] public static void Main(string[] args) {
    bool scroll=Array.IndexOf(args,"--scroll")>=0;
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true)));
    Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)){AutoFlush=true});
    Application.EnableVisualStyles(); var json=new JavaScriptSerializer();
    using(var form=new Form()) {
      form.Text="Knorvia Cua-driver owned smoke fixture"; form.ClientSize=scroll?new Size(1800,980):new Size(880,520);
      form.StartPosition=FormStartPosition.CenterScreen; form.BackColor=Color.FromArgb(28,28,28); form.ForeColor=Color.White;
      var label=new Label{Text="Owned test window only",Left=28,Top=24,Width=760,Height=36};
      var input=new TextBox{AccessibleName="Smoke Unicode input",Left=28,Top=90,Width=640,Height=36,BackColor=Color.FromArgb(45,45,45),ForeColor=Color.White,Font=new Font("Segoe UI",14)};
      var button=new Button{Text="Owned click target",Left=28,Top=160,Width=240,Height=60,BackColor=Color.FromArgb(48,48,48),ForeColor=Color.White,FlatStyle=FlatStyle.Flat};
      int clicks=0; button.Click+=delegate{clicks++;label.Text="Verified clicks: "+clicks;};
      form.Controls.Add(label);form.Controls.Add(input);form.Controls.Add(button);
      var list=new ScrollList{AccessibleName="Owned scroll target",Left=1520,Top=280,Width=180,Height=360,BackColor=Color.FromArgb(38,38,38),ForeColor=Color.White,Font=new Font("Segoe UI",13)};
      if(scroll){for(int i=0;i<80;i++)list.Items.Add("Owned row "+i);form.Controls.Add(list);}
      var deadline=new System.Windows.Forms.Timer{Interval=120000};deadline.Tick+=delegate{form.Close();};
      form.Shown+=delegate{
        form.Activate();input.Focus();deadline.Start();
        Rect frame; if(DwmGetWindowAttribute(form.Handle,9,out frame,Marshal.SizeOf(typeof(Rect)))!=0)throw new Exception("DWM frame unavailable");
        Point point=button.PointToScreen(new Point(button.Width/2,button.Height/2));
        Point scrollPoint=scroll?list.PointToScreen(new Point(list.Width/2,list.Height/2)):Point.Empty;
        Console.WriteLine(json.Serialize(new{ready=true,windowId=form.Handle.ToInt64(),dpi=GetDpiForWindow(form.Handle),scroll=scroll,scrollPoint=new{x=scrollPoint.X,y=scrollPoint.Y},buttonPoint=new{x=point.X,y=point.Y},captureBounds=new{x=frame.L+1,y=frame.T+1,width=frame.R-frame.L-2,height=frame.B-frame.T-2}}));
        var reader=new Thread(delegate(){for(;;){string command=Console.ReadLine();if(command==null)break;try{form.Invoke(new Action(delegate{if(command=="state")Console.WriteLine(json.Serialize(new{text=input.Text,clicks=clicks,scrollTop=scroll?list.TopIndex:0,wheelEvents=list.WheelEvents,wheelPoint=new{x=list.LastWheelPoint.X,y=list.LastWheelPoint.Y}}));else if(command=="close")form.Close();}));}catch(InvalidOperationException){break;}if(command=="close")break;}});
        reader.IsBackground=true;reader.Start();
      };
      Application.Run(form);deadline.Dispose();
    }
  }
}`;
