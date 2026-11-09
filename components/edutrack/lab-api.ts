import {requestJson} from '../../lib/http-json.mjs';
export async function labRequest<T>(path:string,input?:unknown):Promise<T>{return requestJson(path,input) as Promise<T>;}
