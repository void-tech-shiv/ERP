export type Part = 'L' | 'T' | 'P' | 'S';
export type Count = {attended: number; conducted: number};
export type Course = {code:string; name:string; components:Partial<Record<Part,Count>>};
export const PARTS:Part[] = ['L','T','P','S'];
export const WEIGHTS:Record<Part,number> = {L:1,T:.5,P:.5,S:.25};
export const DEMO:Course[] = [
  {code:'25AI2101',name:'Machine Learning',components:{L:{attended:34,conducted:40},T:{attended:11,conducted:12},P:{attended:16,conducted:18}}},
  {code:'25CS2202',name:'Database Management Systems',components:{L:{attended:38,conducted:42},P:{attended:14,conducted:18}}},
  {code:'25MA2103',name:'Probability & Statistics',components:{L:{attended:29,conducted:38},T:{attended:10,conducted:14}}},
  {code:'25AI2204',name:'Deep Learning Foundations',components:{L:{attended:37,conducted:40},P:{attended:17,conducted:20},S:{attended:5,conducted:8}}},
  {code:'25UC2205',name:'Professional Communication',components:{L:{attended:26,conducted:30},S:{attended:10,conducted:12}}}
];
export function totals(course:Course) {
  const a=PARTS.reduce((s,p)=>s+(course.components[p]?.attended||0)*WEIGHTS[p],0);
  const t=PARTS.reduce((s,p)=>s+(course.components[p]?.conducted||0)*WEIGHTS[p],0);
  return {a,t,percentage:t?100*a/t:null};
}
export function projection(a:number,t:number,target:number,part:Part) {
  if(t===0) return {canMiss:0,mustAttend:null};
  const p=target/100, w=WEIGHTS[part];
  return {canMiss:Math.max(0,Math.floor((a/p-t)/w+1e-9)),
    mustAttend:a/t>=p-1e-12?0:Math.max(0,Math.ceil((p*t-a)/(w*(1-p))-1e-9))};
}
export const fmt = (p:number|null) => p===null?'—':p.toFixed(2)+'%';
