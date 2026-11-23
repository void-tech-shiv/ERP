/** Browser-only, per-ERP-account UI preferences.
 * No credentials, grades, attendance or timetable records belong here.
 */
export type StudentPreferences={
  nickname:string;
  currentYear:string;
  currentSemester:string;
  showCgpa:boolean;
};
export const DEFAULT_STUDENT_PREFERENCES:StudentPreferences={
  nickname:'',currentYear:'',currentSemester:'',showCgpa:false,
};
const PREFIX='attendly:settings:v1:';
const LEGACY_NICKNAME_PREFIX='attendly:nickname:v1:';

export function sanitizeStudentPreferences(input:unknown):StudentPreferences{
  const source=input&&typeof input==='object'?input as Partial<StudentPreferences>:{};
  const nickname=typeof source.nickname==='string'
    ?source.nickname.trim().replace(/\s+/g,' ').slice(0,32):'';
  const currentYear=typeof source.currentYear==='string'
    &&/^\d{4}-\d{4}$/.test(source.currentYear)?source.currentYear:'';
  const currentSemester=typeof source.currentSemester==='string'
    &&/^(Odd Sem|Even Sem)$/.test(source.currentSemester)?source.currentSemester:'';
  return {
    nickname,currentYear,currentSemester,
    showCgpa:source.showCgpa===true,
  };
}

export function readStudentPreferences(
  storage:Pick<Storage,'getItem'>,studentId:string,
):StudentPreferences{
  if(!studentId)return {...DEFAULT_STUDENT_PREFERENCES};
  try{
    const json=storage.getItem(PREFIX+studentId);
    if(json!==null){
      return sanitizeStudentPreferences(JSON.parse(json));
    }
    // Bring forward nicknames entered before Settings existed, without moving
    // other ERP data into browser preferences.
    const oldNickname=storage.getItem(LEGACY_NICKNAME_PREFIX+studentId);
    return sanitizeStudentPreferences({nickname:oldNickname||''});
  }catch{
    return {...DEFAULT_STUDENT_PREFERENCES};
  }
}

export function writeStudentPreferences(
  storage:Pick<Storage,'setItem'>,studentId:string,value:StudentPreferences,
):StudentPreferences{
  const normalized=sanitizeStudentPreferences(value);
  if(studentId){
    storage.setItem(PREFIX+studentId,JSON.stringify(normalized));
  }
  return normalized;
}
