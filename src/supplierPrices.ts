export type FreightLine={id:string;origin:string;destination:string;service:string;unit:string;amount:number};
export type FreightList={id:string;supplierId:string;establishedOn:string;createdAt:string;currency:'ARS'|'USD';notes:string;lines:FreightLine[]};
export function argentinaToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function listAtMonth(lists:FreightList[],supplierId:string,month:string,today=argentinaToday()){
 const [year,m]=month.split('-').map(Number);
 if(!year||!m||m>12)return undefined;
 const monthEnd=`${month}-${String(new Date(Date.UTC(year,m,0)).getUTCDate()).padStart(2,'0')}`;
 const cutoff=monthEnd<today?monthEnd:today;
 return lists.filter(l=>l.supplierId===supplierId&&l.establishedOn<=cutoff).sort((a,b)=>b.establishedOn.localeCompare(a.establishedOn)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0];
}
