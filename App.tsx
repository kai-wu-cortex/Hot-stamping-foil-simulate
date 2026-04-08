import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FilmVisualizer } from './components/FilmVisualizer';
import { ControlPanel } from './components/ControlPanel';
import { Dashboard } from './components/Dashboard';
import { calculateSimulation } from './services/simulationLogic';
import { SimulationState, CoatingMethod, SolventType, ProcessStep } from './types';

// Default Initial State
const INITIAL_STATE: SimulationState = {
  step: ProcessStep.OVERVIEW,
  coatingMethod: CoatingMethod.MICRO_GRAVURE,
  autoCamera: false, 
  machine: {
    speed: 50, // m/min
    speedRatio: 1.5, // 150%
    tension: 30, // N
    unwindTension: 30,
    rewindTension: 40,
    temperature: 100, // C
    gapOrMesh: 50, // um
    coronaPower: 2.5, // kW
    laminationPressure: 3, // bar
  },
  liquid: {
    viscosity: 500, // cps
    solidContent: 30, // %
    surfaceTension: 30, // dyn/cm
    solventType: SolventType.BALANCED,
  },
  additives: {
    defoamer: 50, // %
    levelingAgent: 50, // %
    wettingAgent: 50, // %
  },
};

const STEPS = [
  { id: ProcessStep.OVERVIEW, label: "全景", icon: "🏗️" },
  { id: ProcessStep.UNWIND, label: "放卷", icon: "🔄" },
  { id: ProcessStep.PRETREAT, label: "前处理", icon: "⚡" },
  { id: ProcessStep.COATING, label: "涂布", icon: "🖌️" },
  { id: ProcessStep.DRYING, label: "干燥", icon: "🔥" },
  { id: ProcessStep.POST_PROCESS, label: "后处理", icon: "⚙️" },
  { id: ProcessStep.REWIND, label: "收卷", icon: "🎁" },
];

const App: React.FC = () => {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  const [totalMeters, setTotalMeters] = useState(0);
  
  // Real-time calculation of results based on state
  const simulationResult = useMemo(() => calculateSimulation(state), [state]);

  // Simulate Machine Running (Accumulate Meters)
  useEffect(() => {
    let lastTime = Date.now();
    const interval = setInterval(() => {
        const now = Date.now();
        const dt = (now - lastTime) / 1000; // seconds
        lastTime = now;
        
        const metersPerSecond = state.machine.speed / 60;
        setTotalMeters(prev => prev + metersPerSecond * dt);
    }, 50);
    return () => clearInterval(interval);
  }, [state.machine.speed]);

  const setStep = (step: ProcessStep) => setState(prev => ({ ...prev, step, autoCamera: true }));
  const toggleCameraMode = () => setState(prev => ({...prev, autoCamera: !prev.autoCamera}));

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-white overflow-hidden font-sans relative">
      {/* Header */}
      <header className="flex-none h-14 bg-slate-900/90 backdrop-blur border-b border-slate-700 flex items-center px-6 justify-between shadow-lg z-30 relative">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-lg flex items-center justify-center font-bold text-slate-900 text-lg">
             F
           </div>
           <h1 className="text-xl font-bold tracking-tight text-slate-100 hidden md:block">
             CoatingSim <span className="text-yellow-500">Pro</span>
           </h1>
           <div className="h-6 w-px bg-slate-700 mx-2 hidden md:block"></div>
           
           <div className="flex gap-1 overflow-x-auto no-scrollbar">
             {STEPS.map((s) => (
                <button
                    key={s.id}
                    onClick={() => setStep(s.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all whitespace-nowrap ${
                        state.step === s.id 
                        ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' 
                        : 'bg-slate-800 text-gray-400 hover:bg-slate-700 hover:text-white'
                    }`}
                >
                    <span>{s.icon}</span>
                    <span className="hidden sm:inline">{s.label}</span>
                </button>
             ))}
           </div>
        </div>
        
        <div className="flex items-center gap-4">
             <div className="flex flex-col items-end mr-2">
                <span className="text-[10px] text-gray-400 uppercase">Total Run</span>
                <span className="font-mono text-blue-400 font-bold">{totalMeters.toFixed(1)} m</span>
             </div>
             <button 
                onClick={toggleCameraMode}
                className={`text-xs px-3 py-1 rounded border ${state.autoCamera ? 'bg-blue-600 border-blue-400' : 'bg-slate-700 border-gray-600'}`}
             >
                {state.autoCamera ? '📷 视角跟随' : '🔓 自由视角'}
             </button>
             <div className="text-xs text-gray-500 flex flex-col items-end">
                <span className="font-mono text-yellow-500">{(state.machine.speed / 60).toFixed(2)} m/s</span>
                <span>线速度</span>
             </div>
        </div>
      </header>

      {/* Main 3D Area - Full Screen */}
      <div className="absolute inset-0 top-0 bg-black z-0">
             <FilmVisualizer 
                result={simulationResult} 
                speed={state.machine.speed} 
                speedRatio={state.machine.speedRatio}
                tension={state.machine.tension}
                coronaPower={state.machine.coronaPower}
                step={state.step}
                method={state.coatingMethod}
                onStepChange={setStep}
                autoCamera={state.autoCamera}
                totalMeters={totalMeters}
            />
            
            <div className="absolute top-16 left-80 ml-6 bg-black/50 p-2 rounded text-[10px] text-gray-400 pointer-events-none select-none z-10">
                <p>🖱️ 左键: 旋转视角</p>
                <p>🖱️ 右键: 平移</p>
                <p>🖱️ 滚轮: 缩放</p>
                <p>👆 点击单元: 聚焦</p>
            </div>
      </div>

      {/* Floating Control Panel (Left Sidebar) */}
      <div className="absolute top-16 left-4 w-80 bottom-4 z-20 pointer-events-none">
          <div className="w-full h-full shadow-2xl">
             <ControlPanel state={state} onChange={setState} />
          </div>
      </div>

      {/* Floating Dashboard (Right) */}
      <div className="absolute top-16 right-4 w-72 h-[calc(100vh-5rem)] z-10 shadow-2xl pointer-events-none">
           <Dashboard result={simulationResult} totalMeters={totalMeters} />
      </div>
    </div>
  );
};

export default App;