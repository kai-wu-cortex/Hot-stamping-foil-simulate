import { SimulationState, SimulationResult, CoatingMethod, SolventType } from '../types';

/**
 * 模拟核心逻辑
 * 基于流变学、表面张力和机器参数计算涂膜质量
 */
export const calculateSimulation = (state: SimulationState): SimulationResult => {
  const { machine, liquid, additives, coatingMethod } = state;
  const warnings: string[] = [];
  
  // 基础缺陷率
  let bubbleRisk = 0; // 气泡
  let streakRisk = 0; // 纵向条纹
  let orangePeelRisk = 0; // 橘皮
  let ribbingRisk = 0; // 横向条纹/振颤
  
  // --- 1. 速度比例 (Speed Ratio) 影响 ---
  // Micro Gravure 通常需要反向 100%-250% 的速比
  if (coatingMethod === CoatingMethod.MICRO_GRAVURE) {
      if (machine.speedRatio < 0.8) {
          ribbingRisk += 0.4;
          warnings.push("微凹速比过低，易产生横纹 (Ribbing)");
      } else if (machine.speedRatio > 2.5) {
          bubbleRisk += 0.3;
          warnings.push("微凹速比过高，易产生气泡和飞墨");
      }
  } else if (coatingMethod === CoatingMethod.SLOT_DIE) {
      // 狭缝通常接近 1.0 或由泵供料控制
      if (Math.abs(machine.speedRatio - 1.0) > 0.5) {
          // Slot Die doesn't typically use speed ratio like gravure, but assume it represents pump/web match
          // simplified logic for simulation
      }
  }

  // --- 2. 气泡分析 (空气夹带) ---
  const airEntrainmentFactor = (machine.speed * liquid.viscosity) / 2500;
  bubbleRisk += airEntrainmentFactor * (1 - additives.defoamer / 100);
  
  // --- 3. 条纹分析 (流平性 & 流变) ---
  let levelingFactor = (1500 / liquid.viscosity) * (additives.levelingAgent / 100);
  
  if (coatingMethod === CoatingMethod.MAYER_BAR) {
    if (machine.speed > 30 && liquid.viscosity > 500) {
      streakRisk += 0.5;
      warnings.push("速度过快，线棒涂布无法及时流平");
    }
  } 
  
  streakRisk = Math.max(0, streakRisk - (additives.levelingAgent / 100) * 0.4);

  // --- 4. 橘皮分析 (溶剂挥发 & 表面张力) ---
  if (liquid.solventType === SolventType.FAST_DRYING) {
    orangePeelRisk += 0.3;
    if (machine.temperature > 90) {
      orangePeelRisk += 0.4;
      warnings.push("快干溶剂 + 高温 = 严重橘皮风险");
    }
  }
  
  if (machine.coronaPower < 2 && liquid.surfaceTension > 35) {
      orangePeelRisk += 0.2;
      warnings.push("电晕功率不足，基材润湿性差");
  }

  // --- 5. 张力影响 ---
  if (machine.tension > 80) warnings.push("张力过高：基材可能拉伸变形");
  if (machine.tension < 15) {
      warnings.push("张力过低：基材松弛，涂布不均");
      ribbingRisk += 0.2;
  }

  // 归一化风险值
  bubbleRisk = Math.min(1, Math.max(0, bubbleRisk));
  streakRisk = Math.min(1, Math.max(0, streakRisk));
  orangePeelRisk = Math.min(1, Math.max(0, orangePeelRisk));
  ribbingRisk = Math.min(1, Math.max(0, ribbingRisk));

  // 综合评分
  const defectSum = bubbleRisk + streakRisk + orangePeelRisk + ribbingRisk;
  const filmQuality = Math.max(0, 100 - (defectSum * 22));

  // 估算膜厚 (Consider Speed Ratio for Gravure)
  let estimatedThickness = 0;
  switch (coatingMethod) {
    case CoatingMethod.MAYER_BAR:
        estimatedThickness = machine.gapOrMesh * 0.1 * (liquid.solidContent / 100); 
        break;
    case CoatingMethod.MICRO_GRAVURE:
        // Speed ratio directly affects transfer volume in gravure
        estimatedThickness = (machine.gapOrMesh / 2.5) * (liquid.solidContent / 100) * machine.speedRatio; 
        break;
    case CoatingMethod.SLOT_DIE:
        estimatedThickness = (machine.gapOrMesh * 0.8) * (50 / Math.max(1, machine.speed)) * (liquid.solidContent / 100); 
        break;
    default:
        estimatedThickness = 5;
  }

  return {
    filmQuality,
    defects: {
      bubbles: bubbleRisk,
      streaks: streakRisk,
      orangePeel: orangePeelRisk,
      dryingState: Math.min(1, machine.temperature / 120),
      ribbing: ribbingRisk,
    },
    warnings,
    filmThickness: parseFloat(estimatedThickness.toFixed(2)),
  };
};