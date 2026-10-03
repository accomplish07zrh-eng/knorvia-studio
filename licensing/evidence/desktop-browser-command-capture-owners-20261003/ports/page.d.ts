import type {ControlledView} from './browserCommandTypes.js';
import type {BrowserCommand,BrowserCommandResult} from '@knorvia/shared';
type Done=(partial:Omit<BrowserCommandResult,'elapsedMs'>)=>BrowserCommandResult;
export declare function handleNavigate(view:ControlledView,command:BrowserCommand,done:Done,opts?:{navigateSettleMs?:number;signal?:AbortSignal}):Promise<BrowserCommandResult>;
export declare function handleGetState(view:ControlledView,done:Done):Promise<BrowserCommandResult>;
export declare function handleScreenshot(view:ControlledView,command:BrowserCommand,done:Done):Promise<BrowserCommandResult>;
export declare function handleSnapshot(view:ControlledView,command:BrowserCommand,done:Done):Promise<BrowserCommandResult>;
export declare function handleEvaluate(view:ControlledView,command:BrowserCommand,done:Done):Promise<BrowserCommandResult>;
