import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import type { SkillScore } from '../types';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface Props {
  skills: SkillScore;
}

export function RadarChart({ skills }: Props) {
  const data = {
    labels: ['Pitching', 'Encoding', 'Recall', 'Rehearsal', 'Technical'],
    datasets: [
      {
        label: 'Current Level',
        data: [skills.pitching, skills.encoding, skills.recall, skills.rehearsal, skills.technical],
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        borderColor: 'rgba(139, 92, 246, 0.9)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(139, 92, 246, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(139, 92, 246, 1)',
        pointRadius: 4,
      },
      {
        label: 'Target',
        data: [100, 100, 100, 100, 100],
        backgroundColor: 'rgba(30, 30, 60, 0.05)',
        borderColor: 'rgba(100, 100, 150, 0.3)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
      },
    ],
  };

  const options = {
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 25,
          color: 'rgba(150,150,180,0.7)',
          font: { size: 10 },
          backdropColor: 'transparent',
        },
        grid: { color: 'rgba(150,150,200,0.15)' },
        angleLines: { color: 'rgba(150,150,200,0.2)' },
        pointLabels: {
          color: '#c4b5fd',
          font: { size: 13, weight: 'bold' as const },
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; raw: unknown }) =>
            `${ctx.dataset.label}: ${ctx.raw}%`,
        },
      },
    },
    responsive: true,
    maintainAspectRatio: true,
  };

  return <Radar data={data} options={options} />;
}
