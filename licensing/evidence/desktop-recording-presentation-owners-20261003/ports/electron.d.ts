export interface WebFrameMain {isDestroyed():boolean;detached:boolean;}
export interface Session {
  setDisplayMediaRequestHandler(handler:null|((request:{frame:WebFrameMain;videoRequested:boolean;audioRequested:boolean},callback:(result:{video?:WebFrameMain})=>void)=>void)):void;
}
export const session:{fromPartition(partition:string):Session};
export interface MessagePortMain {
  on(event:"message", listener:(event:Electron.MessageEvent)=>void):void;
  on(event:"close", listener:()=>void):void;
  removeListener(event:"message",listener:(event:Electron.MessageEvent)=>void):void;
  start():void;
  close():void;
  postMessage(message:unknown):void;
}
export declare class MessageChannelMain {port1:MessagePortMain;port2:MessagePortMain;}
export declare class BrowserWindow {
  constructor(options:{show:boolean;width:number;height:number;webPreferences:{session:Session;preload:string;sandbox:boolean;contextIsolation:boolean;nodeIntegration:boolean;backgroundThrottling:boolean;webSecurity:boolean}});
  isDestroyed():boolean;
  destroy():void;
  loadFile(path:string):Promise<void>;
  webContents:{
    mainFrame:WebFrameMain;
    setWindowOpenHandler(handler:()=>{action:"deny"}):void;
    postMessage(channel:string,message:unknown,ports:MessagePortMain[]):void;
    on(event:"render-process-gone",listener:(event:unknown,details:{reason?:string})=>void):void;
    on(event:"console-message",listener:(details:{level?:string;message?:string})=>void):void;
    removeListener(event:"render-process-gone",listener:(event:unknown,details:{reason?:string})=>void):void;
    removeListener(event:"console-message",listener:(details:{level?:string;message?:string})=>void):void;
  };
}
declare global {namespace Electron {interface MessageEvent {data:unknown;}}}
