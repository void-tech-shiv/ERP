/** Display-only helpers for authenticated ERP timetable data.
 * No storage, network calls, sample student records or inferred subjects.
 */
export type LTPS='L'|'T'|'P'|'S';
export type TimetableSlot={
  day:string;
  period:number;
  raw:string;
  courseCode:string|null;
  component:LTPS|null;
  section:string|null;
  room:string|null;
};
export type ClassSession={
  day:string;
  startPeriod:number;
  endPeriod:number;
  periodCount:number;
  courseCode:string|null;
  component:LTPS|null;
  section:string|null;
  room:string|null;
  raw:string;
};

/** User-supplied period-time reference. NOT fetched or verified by ERP. */
export const REFERENCE_SLOT_TIMES=[
  {slot:1,start:'7:10 AM',end:'8:00 AM'},
  {slot:2,start:'8:00 AM',end:'8:50 AM'},
  {slot:3,start:'9:20 AM',end:'10:10 AM'},
  {slot:4,start:'10:10 AM',end:'11:00 AM'},
  {slot:5,start:'11:10 AM',end:'12:00 PM'},
  {slot:6,start:'12:00 PM',end:'12:50 PM'},
  {slot:7,start:'1:00 PM',end:'1:50 PM'},
  {slot:8,start:'1:50 PM',end:'2:40 PM'},
  {slot:9,start:'2:40 PM',end:'3:30 PM'},
  {slot:10,start:'3:40 PM',end:'4:20 PM'},
  {slot:11,start:'4:20 PM',end:'5:30 PM'},
] as const;

export const LTPS_LABELS:Record<LTPS,{name:string;weight:number}>={
  L:{name:'Lecture',weight:100},
  T:{name:'Tutorial',weight:50},
  P:{name:'Practical',weight:50},
  S:{name:'Skill',weight:25},
};

export const DAY_NAMES:Record<string,string>={
  Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',
  Fri:'Friday',Sat:'Saturday',Sun:'Sunday',
};
const normalized=(v:string|null)=>v?.replace(/\s+/g,' ').trim().toLowerCase()||'';

/** Merge only adjacent periods holding the exact same lesson metadata.
 * Gaps, component/section/room changes and different subjects break a group.
 */
export function groupTimetableSessions(slots:readonly TimetableSlot[],day:string):ClassSession[]{
  const forDay=slots.filter(s=>s.day===day)
    .sort((a,b)=>a.period-b.period);
  const result:ClassSession[]=[];
  for(const slot of forDay){
    if(!Number.isSafeInteger(slot.period)||slot.period<1)continue;
    const last=result[result.length-1];
    const same=last&&slot.period===last.endPeriod+1&&
      normalized(last.courseCode)===normalized(slot.courseCode)&&
      last.component===slot.component&&
      normalized(last.section)===normalized(slot.section)&&
      normalized(last.room)===normalized(slot.room)&&
      normalized(last.raw)===normalized(slot.raw);
    if(same){
      last.endPeriod=slot.period;
      last.periodCount++;
    }else{
      result.push({
        day:slot.day,startPeriod:slot.period,endPeriod:slot.period,periodCount:1,
        raw:slot.raw,courseCode:slot.courseCode,component:slot.component,
        section:slot.section,room:slot.room,
      });
    }
  }
  return result;
}

export function sessionSlotLabel(session:Pick<ClassSession,'startPeriod'|'endPeriod'>):string{
  return session.startPeriod===session.endPeriod
    ?'S'+session.startPeriod
    :'S'+session.startPeriod+' – S'+session.endPeriod;
}

/** Show reference times only for explicitly numbered ERP periods.
 * Inferred column positions must never be presented as verified periods.
 */
export function sessionReferenceTime(
  session:Pick<ClassSession,'startPeriod'|'endPeriod'>,
  periodsInferred:boolean,
):string|null{
  if(periodsInferred)return null;
  const start=REFERENCE_SLOT_TIMES.find(x=>x.slot===session.startPeriod);
  const end=REFERENCE_SLOT_TIMES.find(x=>x.slot===session.endPeriod);
  return start&&end?start.start+' – '+end.end:null;
}
