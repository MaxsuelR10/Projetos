import {createApi} from '../http-api.mjs';
let handler;
export default (req,res)=>{handler??=createApi();return handler(req,res);};
