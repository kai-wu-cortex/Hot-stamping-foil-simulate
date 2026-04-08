export enum CoatingMethod {
  SLOT_DIE = '狭缝涂布 (Slot Die)',
  MICRO_GRAVURE = '微凹涂布 (Micro Gravure)',
  MAYER_BAR = '线棒涂布 (Mayer Bar)',
  COMMA_COATER = '逗号刮刀 (Comma Coater)',
}

export enum SolventType {
  FAST_DRYING = '快干溶剂 (如丙酮/乙酸乙酯)',
  SLOW_DRYING = '慢干溶剂 (如DBE/环己酮)',
  BALANCED = '平衡混合溶剂',
}

export enum ProcessStep {
  OVERVIEW = '全景概览',
  UNWIND = '放卷单元',
  PRETREAT = '前处理 (剥离/电晕)',
  COATING = '涂布单元',
  DRYING = '干燥固化',
  POST_PROCESS = '后处理 (检测/复合)',
  REWIND = '收卷单元',
}

export interface MachineParams {
  speed: number; // m/min
  speedRatio: number; // Roll Speed / Web Speed Ratio (e.g. 1.5)
  tension: number; // N (Global/Main Web Tension)
  unwindTension: number; // N
  rewindTension: number; // N
  temperature: number; // Celsius
  coronaPower: number; // kW
  laminationPressure: number; // bar
  gapOrMesh: number; // um or Mesh ID
}

export interface LiquidParams {
  viscosity: number; // cps
  solidContent: number; // %
  surfaceTension: number; // dyn/cm
  solventType: SolventType;
}

export interface AdditivesParams {
  defoamer: number; // 0-100%
  levelingAgent: number; // 0-100%
  wettingAgent: number; // 0-100%
}

export interface SimulationState {
  step: ProcessStep;
  coatingMethod: CoatingMethod;
  machine: MachineParams;
  liquid: LiquidParams;
  additives: AdditivesParams;
  autoCamera: boolean; // Control camera mode
}

export interface SimulationResult {
  filmQuality: number; // 0-100
  defects: {
    bubbles: number; // 0-1
    streaks: number; // 0-1
    orangePeel: number; // 0-1
    dryingState: number; // 0-1
    ribbing: number; // 0-1
  };
  warnings: string[];
  filmThickness: number; // um
}