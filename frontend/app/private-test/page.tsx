import { redirect } from 'next/navigation';

/** Old test bookmarks now open the real Attendly workspace. */
export default function LegacyPrivateTest(){
  redirect('/');
}
