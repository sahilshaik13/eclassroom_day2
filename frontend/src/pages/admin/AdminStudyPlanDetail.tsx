import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ChevronLeft, Loader2, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout';
import { Button } from '@/components/ui/button';
import StudyPlanBuilder, { Day, TaskType } from '@/components/study-plan/StudyPlanBuilder';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminStudyPlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<any>(null);
  const [days, setDays] = useState<Day[]>([]);

  useEffect(() => {
    if (id === 'new') {
      setTemplate({ name: '', description: '' });
      setDays([]);
      setLoading(false);
    } else {
      loadTemplate();
    }
  }, [id]);

  const loadTemplate = async () => {
    try {
      const res = await api.get(`/admin/study-plans/${id}`);
      setTemplate(res.data.data);
      setDays(res.data.data.days || []);
    } catch (err) {
      toast.error("Failed to load template");
      navigate('/admin/study-plans');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!template.name) return toast.error("Template name is required");
    setSaving(true);
    try {
      if (id === 'new') {
        const res = await api.post('/admin/study-plans', template);
        toast.success("Template created");
        navigate(`/admin/study-plans/${res.data.data.id}`);
      } else {
        // Implement PATCH /admin/study-plans/{id} if needed
        toast.success("Info updated (simulation)");
      }
    } catch (err) {
      toast.error("Failed to save template info");
    } finally {
      setSaving(false);
    }
  };

  // ── Real-time handlers for Admin Template Editing ────────────────

  const handleAddDay = async () => {
    if (id === 'new') return toast.error("Save template info first");
    const nextDay = (days.length + 1);
    try {
        const res = await api.post(`/admin/study-plans/${id}/days`, { day_number: nextDay });
        setDays([...days, { ...res.data.data, periods: [] }]);
        toast.success(`Day ${nextDay} added`);
    } catch { toast.error("Failed to add day"); }
  };

  const handleAddPeriod = async (dayIdx: number) => {
    const day = days[dayIdx];
    const nextOrder = (day.periods?.length || 0);
    try {
        const res = await api.post(`/admin/study-plans/days/${day.id}/periods`, {
            title: 'New Period',
            duration_minutes: 30,
            order_index: nextOrder
        });
        const newDays = [...days];
        newDays[dayIdx].periods = [...(newDays[dayIdx].periods || []), { ...res.data.data, tasks: [] }];
        setDays(newDays);
    } catch { toast.error("Failed to add period"); }
  };

  const handleUpdatePeriod = async (dayIdx: number, pIdx: number, updates: any) => {
    const period = days[dayIdx].periods[pIdx];
    try {
        await api.patch(`/admin/study-plans/periods/${period.id}`, updates);
        const newDays = [...days];
        newDays[dayIdx].periods[pIdx] = { ...period, ...updates };
        setDays(newDays);
    } catch { toast.error("Failed to update period"); }
  };

  const handleDeletePeriod = async (dayIdx: number, pIdx: number) => {
    const period = days[dayIdx].periods[pIdx];
    if (!confirm("Delete this period?")) return;
    try {
        await api.delete(`/admin/study-plans/periods/${period.id}`);
        const newDays = [...days];
        newDays[dayIdx].periods.splice(pIdx, 1);
        setDays(newDays);
        toast.success("Period deleted");
    } catch { toast.error("Failed to delete period"); }
  };

  const handleAddTask = async (dayIdx: number, pIdx: number, type: TaskType) => {
    const period = days[dayIdx].periods[pIdx];
    const nextOrder = (period.tasks?.length || 0);
    try {
        const res = await api.post(`/admin/study-plans/periods/${period.id}/tasks`, {
            title: `New ${type} Task`,
            task_type: type,
            required: true,
            order_index: nextOrder,
            config: type === 'mcq' ? { questions: [] } : {}
        });
        const newDays = [...days];
        newDays[dayIdx].periods[pIdx].tasks = [...(newDays[dayIdx].periods[pIdx].tasks || []), res.data.data];
        setDays(newDays);
    } catch { toast.error("Failed to add task"); }
  };

  const handleUpdateTask = async (dayIdx: number, pIdx: number, tIdx: number, updates: any) => {
    const task = days[dayIdx].periods[pIdx].tasks[tIdx];
    try {
        await api.patch(`/admin/study-plans/tasks/${task.id}`, updates);
        const newDays = [...days];
        newDays[dayIdx].periods[pIdx].tasks[tIdx] = { ...task, ...updates };
        setDays(newDays);
    } catch { toast.error("Failed to update task"); }
  };

  const handleDeleteTask = async (dayIdx: number, pIdx: number, tIdx: number) => {
    const task = days[dayIdx].periods[pIdx].tasks[tIdx];
    try {
        await api.delete(`/admin/study-plans/tasks/${task.id}`);
        const newDays = [...days];
        newDays[dayIdx].periods[pIdx].tasks.splice(tIdx, 1);
        setDays(newDays);
        toast.success("Task deleted");
    } catch { toast.error("Failed to delete task"); }
  };

  const handleUpdateDayDate = async (dayIdx: number, dateStr: string) => {
    const day = days[dayIdx];
    try {
        await api.patch(`/admin/study-plans/days/${day.id}`, { scheduled_date: dateStr });
        const newDays = [...days];
        newDays[dayIdx].scheduled_date = dateStr;
        setDays(newDays);
    } catch { toast.error("Failed to update day"); }
  };

  if (loading || !template) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <DashboardPageLayout
      title={id === 'new' ? "New Study Plan Template" : "Edit Template"}
      description="Design a structured curriculum template that teachers can later assign to their classrooms."
      actions={
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate('/admin/study-plans')} className="rounded-xl font-bold">
            <ChevronLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={handleSaveInfo} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black gap-2 px-6">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {id === 'new' ? 'Create Template' : 'Save Info'}
          </Button>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto space-y-8 pb-20">
        <Card className="border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden">
          <CardHeader className="bg-slate-900 text-white p-8">
            <CardTitle className="text-2xl font-black">Template Details</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Template Name</Label>
                <Input 
                  value={template.name}
                  onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                  placeholder="e.g. 30-Day Hifz Intensive"
                  className="h-14 text-lg font-bold rounded-2xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Description</Label>
                <Input 
                  value={template.description || ''}
                  onChange={(e) => setTemplate({ ...template, description: e.target.value })}
                  placeholder="Briefly describe the goal of this plan"
                  className="h-14 text-slate-600 rounded-2xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {id !== 'new' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Play className="h-4 w-4 fill-current" />
                </span>
                Curriculum Structure
              </h3>
              <Button onClick={handleAddDay} className="bg-slate-900 text-white rounded-xl h-10 px-4 font-bold text-xs">
                Add Day {days.length + 1}
              </Button>
            </div>
            
            <StudyPlanBuilder 
              days={days}
              onChange={setDays}
              onAddPeriod={handleAddPeriod}
              onUpdatePeriod={handleUpdatePeriod}
              onDeletePeriod={handleDeletePeriod}
              onAddTask={handleAddTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onUpdateDayDate={handleUpdateDayDate}
            />
          </div>
        )}
      </div>
    </DashboardPageLayout>
  );
}
