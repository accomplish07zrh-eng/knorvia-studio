import type {ControlledViewWebContents} from './browserCommandTypes.js';
import type {BrowserPageState} from '@knorvia/shared';
export declare function now():number;
export declare function readState(contents:ControlledViewWebContents):BrowserPageState;
export declare function isAllowedBrowserUrl(rawUrl:string):boolean;
