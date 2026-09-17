import { estimateJourneyCrossings, catalogDate } from '../lib/route-stations.mjs';
const reply = (statusCode, body) => ({statusCode, headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
export async function handler(event) {
 if(event.httpMethod !== 'POST') return reply(405,{error:'Método no permitido.'});
 if((event.body?.length ?? 0)>5000000) return reply(413,{error:'Recorrido demasiado extenso.'});
 let input; try {input=JSON.parse(event.body ?? '{}');}catch{return reply(400,{error:'Recorrido inválido.'});}
 const path=input.path;
 if(!Array.isArray(path)||path.length<2||path.length>100000||path.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<-56||p[0]>-20||p[1]<-75||p[1]>-52))return reply(400,{error:'Se necesita el trazado de Google dentro de Argentina.'});
 const split = input.returnStartIndex;
 if (split !== undefined && (!Number.isInteger(split) || split < 2 || split > path.length - 2)) return reply(400,{error:'El trazado debe incluir ida y vuelta completas.'});
 return reply(200,{tolls:estimateJourneyCrossings(path, split),catalogDate,estimated:true});
}
