import { estimateJourneyCrossings, estimateLegCrossings, catalogDate } from '../lib/route-stations.mjs';
const reply = (statusCode, body) => ({statusCode, headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
export async function handler(event) {
 if(event.httpMethod !== 'POST') return reply(405,{error:'Método no permitido.'});
 if((event.body?.length ?? 0)>5000000) return reply(413,{error:'Recorrido demasiado extenso.'});
 let input; try {input=JSON.parse(event.body ?? '{}');}catch{return reply(400,{error:'Recorrido inválido.'});}
 if (!input || typeof input !== 'object') return reply(400,{error:'Recorrido inválido.'});
 const validPath = path => Array.isArray(path) && path.length >= 2 && path.length <= 100000 && path.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= -56 && p[0] <= -20 && p[1] >= -75 && p[1] <= -52);
 if (input.legs !== undefined) {
   const legs = input.legs;
   if (!Array.isArray(legs) || !legs.length || legs.length > 25 || typeof input.isRoundTrip !== 'boolean' || (input.isRoundTrip && legs.length < 2) ||
       legs.some(leg => !leg || !validPath(leg.path) || typeof leg.origin !== 'string' || typeof leg.destination !== 'string' || !leg.origin.trim() || !leg.destination.trim() || leg.origin.length > 1000 || leg.destination.length > 1000) ||
       legs.reduce((sum, leg) => sum + leg.path.length, 0) > 100000 ||
       legs.some((leg, index) => index > 0 && leg.origin !== legs[index - 1].destination) ||
       (input.isRoundTrip && legs.at(-1).destination !== legs[0].origin)) return reply(400,{error:'Se necesitan los tramos completos y ordenados del recorrido.'});
   return reply(200,{tolls:estimateLegCrossings(legs,input.isRoundTrip),catalogDate,estimated:true});
 }
 const path=input.path;
 if(!Array.isArray(path)||path.length<2||path.length>100000||path.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<-56||p[0]>-20||p[1]<-75||p[1]>-52))return reply(400,{error:'Se necesita el trazado de Google dentro de Argentina.'});
 const split = input.returnStartIndex;
 if (split !== undefined && (!Number.isInteger(split) || split < 2 || split > path.length - 2)) return reply(400,{error:'El trazado debe incluir ida y vuelta completas.'});
 return reply(200,{tolls:estimateJourneyCrossings(path, split),catalogDate,estimated:true});
}
