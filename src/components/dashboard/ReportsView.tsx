import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Clock, 
  Users, 
  MessageSquare, 
  CheckCircle, 
  TrendingUp, 
  TrendingDown,
  Star
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const data = [
  { name: 'Seg', atendimentos: 45, tempo: 12 },
  { name: 'Ter', atendimentos: 52, tempo: 15 },
  { name: 'Qua', atendimentos: 48, tempo: 10 },
  { name: 'Qui', atendimentos: 61, tempo: 18 },
  { name: 'Sex', atendimentos: 55, tempo: 14 },
  { name: 'Sáb', atendimentos: 30, tempo: 8 },
  { name: 'Dom', atendimentos: 20, tempo: 10 },
];

const sectorData = [
  { name: 'Comercial', value: 400 },
  { name: 'Suporte', value: 300 },
  { name: 'Financeiro', value: 200 },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export function ReportsView() {
  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 overflow-y-auto h-full">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Relatórios Analíticos</h2>
        <p className="text-muted-foreground">Monitore o desempenho da sua equipe e a satisfação dos clientes.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-sm border-none bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div className="flex items-center text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-3 h-3 mr-1" /> +12%
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500">Total de Atendimentos</p>
            <h3 className="text-2xl font-bold text-slate-900">1.284</h3>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex items-center text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                <TrendingDown className="w-3 h-3 mr-1" /> -5%
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500">TMA (Tempo Médio)</p>
            <h3 className="text-2xl font-bold text-slate-900">08:45</h3>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div className="flex items-center text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-3 h-3 mr-1" /> +8%
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500">Taxa de Resolução</p>
            <h3 className="text-2xl font-bold text-slate-900">94.2%</h3>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <Star className="w-5 h-5" />
              </div>
              <div className="flex items-center text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <TrendingUp className="w-3 h-3 mr-1" /> +2%
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500">Avaliação Média</p>
            <h3 className="text-2xl font-bold text-slate-900">4.8 / 5</h3>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Main Volume Chart */}
        <Card className="shadow-sm border-none bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Volume de Atendimentos por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    cursor={{fill: '#f8fafc'}}
                  />
                  <Bar dataKey="atendimentos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribution Chart */}
        <Card className="shadow-sm border-none bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Distribuição por Setor</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sectorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="font-bold text-slate-700">
                    Setores
                  </text>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-4">
                {sectorData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[index]}} />
                    <span className="text-xs font-medium text-slate-500">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
