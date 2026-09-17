type IndexedCost={daySourceValue:number;dayFadeeacIndex:number;kmSourceValue:number;kmFadeeacIndex:number;allocation:{perDay:boolean;perKm:boolean}};
export function weightedCostAdjustment(lines:IndexedCost[]) {
 let source=0,updated=0;
 for(const line of lines){
  if(line.allocation.perDay){source+=line.daySourceValue;updated+=line.daySourceValue*(1+line.dayFadeeacIndex/100);}
  if(line.allocation.perKm){source+=line.kmSourceValue;updated+=line.kmSourceValue*(1+line.kmFadeeacIndex/100);}
 }
 return source>0?(updated/source-1)*100:0;
}
