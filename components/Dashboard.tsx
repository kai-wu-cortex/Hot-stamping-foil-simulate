import React, { useEffect, useRef } from 'react';
import { SimulationResult } from '../types';

interface DashboardProps {
  result: SimulationResult;
  totalMeters?: number;
}

const MetricCard = ({ title, value, unit, color = "white" }: any) => (
  <div className="bg-slate-800/80 p-3 rounded border border-slate-700 backdrop-blur-sm">
    <div className="text-xs text-gray-400 uppercase tracking-wider">{title}</div>
    <div className={`text-xl font-bold text-${color}-400`}>
      {value} <span className="text-sm text-gray-500">{unit}</span>
    </div>
  </div>
);

const NoiseMap = ({ defects }: { defects: any }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Render parameters
        const width = canvas.width;
        const height = canvas.height;
        const bubbles = defects.bubbles;
        const streaks = defects.streaks;
        const orangePeel = defects.orangePeel;

        // Clear
        ctx.fillStyle = '#1e293b'; // Slate 800
        ctx.fillRect(0, 0, width, height);

        // Draw Simulated Noise
        // 1. Base grainy texture (Orange Peel)
        if (orangePeel > 0) {
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const noise = (Math.random() - 0.5) * 50 * orangePeel;
                data[i] = Math.max(0, data[i] + noise);     // R
                data[i + 1] = Math.max(0, data[i + 1] + noise); // G
                data[i + 2] = Math.max(0, data[i + 2] + noise); // B
            }
            ctx.putImageData(imageData, 0, 0);
        }

        // 2. Streaks (Horizontal lines for scan effect, but streaks are longitudinal on web)
        // We simulate a top-down view of the web. Vertical lines = longitudinal streaks.
        if (streaks > 0) {
            ctx.globalCompositeOperation = 'screen';
            ctx.strokeStyle = `rgba(255, 255, 255, ${streaks * 0.4})`;
            ctx.lineWidth = 2;
            const count = Math.floor(streaks * 20);
            for (let i = 0; i < count; i++) {
                const x = Math.random() * width;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
        }

        // 3. Bubbles (Circles)
        if (bubbles > 0) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = `rgba(200, 220, 255, ${Math.min(0.9, bubbles + 0.2)})`;
            const count = Math.floor(bubbles * 50);
            for (let i = 0; i < count; i++) {
                const x = Math.random() * width;
                const y = Math.random() * height;
                const r = Math.random() * 3 + 1;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }, [defects]);

    return (
        <div className="w-full h-40 bg-black rounded border border-gray-600 overflow-hidden relative">
            <canvas ref={canvasRef} width={300} height={160} className="w-full h-full opacity-80" />
            <div className="absolute top-1 left-1 text-[10px] text-green-400 font-mono bg-black/50 px-1 rounded">
                REAL-TIME QC SCAN
            </div>
            <div className="absolute bottom-1 right-1 text-[10px] text-gray-400 font-mono">
                {defects.bubbles > 0.1 ? 'FAIL: BUBBLES' : defects.streaks > 0.1 ? 'FAIL: STREAKS' : 'PASS'}
            </div>
        </div>
    );
}

export const Dashboard: React.FC<DashboardProps> = ({ result, totalMeters = 0 }) => {
  return (
    <div className="h-full bg-slate-900/80 backdrop-blur-md border-l border-slate-700/50 p-4 flex flex-col gap-4 overflow-y-auto pointer-events-auto">
        <h3 className="text-lg font-bold text-white border-b border-gray-700 pb-2">模拟分析报告</h3>
        
        <div className="grid grid-cols-2 gap-2">
            <MetricCard title="生产米数" value={totalMeters.toFixed(0)} unit="m" color="yellow" />
            <MetricCard title="预估膜厚" value={result.filmThickness} unit="μm" color="blue" />
            <MetricCard title="综合评分" value={result.filmQuality.toFixed(0)} unit="分" color={result.filmQuality > 80 ? 'green' : 'red'} />
        </div>

        <div className="bg-slate-800/50 rounded p-4 border border-slate-700 flex-grow flex flex-col">
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">质量分布图 (Quality Map)</h4>
            <NoiseMap defects={result.defects} />
            <div className="mt-3 space-y-2">
                 <div className="flex justify-between text-xs text-gray-400">
                    <span>气泡: {(result.defects.bubbles * 100).toFixed(0)}%</span>
                    <span>条纹: {(result.defects.streaks * 100).toFixed(0)}%</span>
                 </div>
                 <div className="w-full bg-gray-700 h-1 rounded overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${result.filmQuality}%` }} />
                 </div>
            </div>
        </div>

        {result.warnings.length > 0 && (
            <div className="bg-red-900/40 border border-red-800/50 rounded p-3 animate-pulse">
                <h4 className="text-xs font-bold text-red-400 uppercase mb-2 flex items-center gap-1">
                    ⚠️ 风险警报
                </h4>
                <ul className="list-disc list-inside text-xs text-red-200 space-y-1">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
            </div>
        )}
    </div>
  );
};