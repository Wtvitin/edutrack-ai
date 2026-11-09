"use client";
import {Link2} from 'lucide-react';
import {ClassroomConnection} from './classroom-connection';

export function IntegrationsView({mode,saving,onImported}:{mode:'account'|'demo';saving:boolean;onImported:()=>Promise<void>}){
  return <div className="integrations-page">
    <div className="page-heading classroom-page-heading">
      <span className="classroom-planning-mark" aria-hidden="true"><Link2 size={24}/></span>
      <div><h1>Integrações</h1><p>Traga as atividades do Google Classroom para seu planejamento.</p></div>
    </div>
    <ClassroomConnection mode={mode} saving={saving} onImported={onImported}/>
  </div>;
}
