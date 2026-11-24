import { useState } from 'react';
import { latestAssessment, useStore } from './store';
import { apiReady } from './validate';
import { Ico, ToastHost } from './components/ui';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Character from './screens/Character';
import Rewards from './screens/Rewards';
import PlanScreen from './screens/Plan';
import Record from './screens/Record';
import Meal from './screens/Meal';
import Import from './screens/Import';
import Sleep from './screens/Sleep';
import Settings from './screens/Settings';
import ApiSetup from './screens/ApiSetup';
import BodyCheck from './screens/BodyCheck';
import VersionNotice from './components/VersionNotice';

import OnlineGuild from './screens/OnlineGuild';

export type Route = 'onlineGuild' | 'home' | 'char' | 'record' | 'rewards' | 'plan' | 'meal' | 'import' | 'sleep' | 'settings' | 'body';
export type Go = (r: Route, arg?: string) => void;

export default function App() {
  const state = useStore((s) => s);
  const hasProfile = !!state.profile;
  const motion = useStore((s) => s.prefs?.motion !== false);
  const [route, setRoute] = useState<Route>('plan');
  const [arg, setArg] = useState<string | undefined>();
  const go: Go = (r, a) => {
    setRoute(r);
    setArg(a);
    window.scrollTo(0, 0);
  };

  if (!apiReady(state.llm)) return <div className="app"><ApiSetup /><ToastHost /></div>;
  const needsAssessment = !latestAssessment(state);
  if ((needsAssessment && route !== 'settings') || route === 'body') return <div className={'app' + (motion ? '' : ' no-motion')}><BodyCheck onSettings={() => go('settings')} onDone={() => go('plan')} onCancel={needsAssessment ? undefined : () => go('plan')} /><ToastHost /></div>;
  if (!hasProfile && route !== 'settings') return (<div className="app"><Onboarding /><ToastHost /></div>);
  if (needsAssessment || !hasProfile) return <div className="app"><Settings go={(next, value) => go(next === 'char' ? 'plan' : next, value)} /><ToastHost /></div>;

  const tab = ['meal', 'import', 'sleep'].includes(route) ? 'record' : route === 'settings' ? 'char' : route;
  return (
    <div className={'app' + (motion ? '' : ' no-motion')}>
      <VersionNotice />
      {route === 'onlineGuild' && <OnlineGuild />}
      {route === 'home' && <Home go={go} />}
      {route === 'char' && <Character go={go} />}
      {route === 'rewards' && <Rewards />}
      {route === 'plan' && <PlanScreen go={go} />}
      {route === 'record' && <Record go={go} />}
      {route === 'meal' && <Meal go={go} slot={arg} />}
      {route === 'import' && <Import go={go} />}
      {route === 'sleep' && <Sleep go={go} />}
      {route === 'settings' && <Settings go={go} />}
      <nav className="nav">
        <NavBtn on={tab === 'home'} icon="sword" label="任务" onClick={() => go('home')} />
        <NavBtn on={tab === 'char'} icon="helmet" label="角色" onClick={() => go('char')} />
        <button className={'plus' + (tab === 'record' ? ' on' : '')} onClick={() => go('record')}><span className="fs-xl" style={{ lineHeight: 1 }}>＋</span>记录</button>
        <NavBtn on={tab === 'rewards'} icon="chest" label="奖励" onClick={() => go('rewards')} />
        <NavBtn on={tab === 'plan'} icon="scroll" label="计划" onClick={() => go('plan')} />
      </nav>
      <ToastHost />
    </div>
  );
}

const NavBtn = ({ on, icon, label, onClick }: { on: boolean; icon: string; label: string; onClick: () => void }) => (
  <button className={on ? 'on' : ''} onClick={onClick}>
    <Ico n={icon} s={28} />
    {label}
  </button>
);
