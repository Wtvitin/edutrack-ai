"use client";
import {ClassroomConnection} from './classroom-connection';

export function IntegrationsView({mode,saving,onImported}:{mode:'account'|'demo';saving:boolean;onImported:()=>Promise<void>}){
  return <div className="integrations-page">
    <div className="page-heading">
      <div><h1>Integrações</h1><p>Traga as atividades do Google Classroom para seu planejamento.</p></div>
    </div>
    <ClassroomConnection mode={mode} saving={saving} onImported={onImported}/>
  </div>;
}
