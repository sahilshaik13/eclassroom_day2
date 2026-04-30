import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, ChevronRight, ChevronDown, Clock, BookOpen, CheckSquare, HelpCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from "@/lib/utils";
import MCQConfigModal from './MCQConfigModal';

export type TaskType = 'memorise' | 'review' | 'recite' | 'listen' | 'read' | 'mcq' | 'written' | 'reflection';

export interface Task {
  id?: string;
  title: string;
  description?: string;
  task_type: TaskType;
  required: boolean;
  order_index: number;
  config: any;
}

export interface Period {
  id?: string;
  title: string;
  duration_minutes: number;
  order_index: number;
  tasks: Task[];
}

export interface Day {
  id?: string;
  day_number: number;
  scheduled_date?: string;
  periods: Period[];
}

interface StudyPlanBuilderProps {
  days: Day[];
  onChange: (days: Day[]) => void;
  readOnly?: boolean;
  // Optional CRUD callbacks for real-time saving (Teacher mode)
  onAddPeriod?: (dayIdx: number) => void;
  onUpdatePeriod?: (dayIdx: number, pIdx: number, updates: any) => void;
  onDeletePeriod?: (dayIdx: number, pIdx: number) => void;
  onAddTask?: (dayIdx: number, pIdx: number, type: TaskType) => void;
  onUpdateTask?: (dayIdx: number, pIdx: number, tIdx: number, updates: any) => void;
  onDeleteTask?: (dayIdx: number, pIdx: number, tIdx: number) => void;
  onUpdateDayDate?: (dayIdx: number, dateStr: string) => void;
}

// Helper for local-first editing to prevent cursor jumps/placeholder resets
function EditableField({ value, onBlur, placeholder, className, readOnly, type = "text" }: any) {
  const [local, setLocal] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => { 
    if (!isFocused) setLocal(value); 
  }, [value, isFocused]);
  
  return (
    <Input 
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => { 
        setIsFocused(false);
        if (local !== value) onBlur(local); 
      }}
      placeholder={placeholder}
      readOnly={readOnly}
      className={cn(
        "bg-transparent border-none focus-visible:ring-0 shadow-none px-2 h-auto py-1 font-medium",
        className
      )}
    />
  );
}

export default function StudyPlanBuilder({ 
  days, 
  onChange, 
  readOnly = false,
  onAddPeriod,
  onUpdatePeriod,
  onDeletePeriod,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onUpdateDayDate
}: StudyPlanBuilderProps) {
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({ 1: true });
  const [activeMCQTask, setActiveMCQTask] = useState<{ dIdx: number, pIdx: number, tIdx: number } | null>(null);

  const toggleDay = (dayNum: number) => {
    setExpandedDays(prev => ({ ...prev, [dayNum]: !prev[dayNum] }));
  };

  const addDay = () => {
    const nextDay = days.length + 1;
    onChange([...days, { day_number: nextDay, periods: [] }]);
    setExpandedDays(prev => ({ ...prev, [nextDay]: true }));
  };

  const removeDay = (idx: number) => {
    const newDays = days.filter((_, i) => i !== idx).map((d, i) => ({ ...d, day_number: i + 1 }));
    onChange(newDays);
  };

  const handleAddPeriod = (dayIdx: number) => {
    if (onAddPeriod) return onAddPeriod(dayIdx);
    const newDays = [...days];
    newDays[dayIdx].periods.push({
      title: `Period ${newDays[dayIdx].periods.length + 1}`,
      duration_minutes: 30,
      order_index: newDays[dayIdx].periods.length,
      tasks: []
    });
    onChange(newDays);
  };

  const handleUpdatePeriod = (dayIdx: number, pIdx: number, updates: any) => {
    if (onUpdatePeriod) return onUpdatePeriod(dayIdx, pIdx, updates);
    const newDays = [...days];
    newDays[dayIdx].periods[pIdx] = { ...newDays[dayIdx].periods[pIdx], ...updates };
    onChange(newDays);
  };

  const handleRemovePeriod = (dayIdx: number, pIdx: number) => {
    if (onDeletePeriod) return onDeletePeriod(dayIdx, pIdx);
    const newDays = [...days];
    newDays[dayIdx].periods.splice(pIdx, 1);
    onChange(newDays);
  };

  const handleAddTask = (dayIdx: number, periodIdx: number, type: TaskType = 'memorise') => {
    if (onAddTask) return onAddTask(dayIdx, periodIdx, type);
    const newDays = [...days];
    newDays[dayIdx].periods[periodIdx].tasks.push({
      title: 'New Task',
      task_type: type,
      required: true,
      order_index: newDays[dayIdx].periods[periodIdx].tasks.length,
      config: type === 'mcq' ? { questions: [] } : {}
    });
    onChange(newDays);
  };

  const handleUpdateTask = (dayIdx: number, periodIdx: number, taskIdx: number, updates: Partial<Task>) => {
    if (onUpdateTask) return onUpdateTask(dayIdx, periodIdx, taskIdx, updates);
    const newDays = [...days];
    newDays[dayIdx].periods[periodIdx].tasks[taskIdx] = {
      ...newDays[dayIdx].periods[periodIdx].tasks[taskIdx],
      ...updates
    };
    onChange(newDays);
  };

  const handleRemoveTask = (dayIdx: number, periodIdx: number, taskIdx: number) => {
    if (onDeleteTask) return onDeleteTask(dayIdx, periodIdx, taskIdx);
    const newDays = [...days];
    newDays[dayIdx].periods[periodIdx].tasks.splice(taskIdx, 1);
    onChange(newDays);
  };

  return (
    <div className="space-y-6">
      {days.map((day, dIdx) => (
        <div key={dIdx} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Day Header */}
          <div 
            className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
            onClick={() => toggleDay(day.day_number)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black shadow-lg shadow-blue-200">
                {day.day_number}
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Day {day.day_number}</h3>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                  {(day.periods || []).length} Periods • {(day.periods || []).reduce((acc, p) => acc + (p.tasks || []).length, 0)} Tasks
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Date Selection */}
              <div className="hidden sm:flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-1.5 border border-slate-200" onClick={e => e.stopPropagation()}>
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <input 
                  type="date"
                  value={day.scheduled_date || ''}
                  onChange={(e) => onUpdateDayDate ? onUpdateDayDate(dIdx, e.target.value) : null}
                  className="bg-transparent border-none text-[11px] font-black uppercase text-slate-600 focus:ring-0 outline-none"
                  disabled={readOnly || !onUpdateDayDate}
                />
              </div>
              
              {!readOnly && !onDeletePeriod && ( // Only show remove day in admin template mode
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                  onClick={(e) => { e.stopPropagation(); removeDay(dIdx); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {expandedDays[day.day_number] ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
            </div>
          </div>

          {/* Day Content */}
          {expandedDays[day.day_number] && (
            <div className="p-6 pt-0 space-y-6 bg-slate-50/50">
              {(day.periods || []).map((period, pIdx) => (
                <Card key={pIdx} className="border-slate-200 shadow-none rounded-2xl overflow-hidden bg-white">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <GripVertical className="h-4 w-4 text-slate-300 cursor-move" />
                      <EditableField 
                        value={period.title} 
                        onBlur={(val: string) => handleUpdatePeriod(dIdx, pIdx, { title: val })}
                        placeholder="Period Title"
                        className="h-8 bg-transparent border-none font-bold text-slate-700 focus-visible:ring-0 px-0 w-48"
                        readOnly={readOnly}
                      />
                      <div className="flex items-center gap-2 text-slate-400 ml-4">
                        <Clock className="h-3.5 w-3.5" />
                        <EditableField 
                          type="number"
                          value={period.duration_minutes}
                          onBlur={(val: any) => handleUpdatePeriod(dIdx, pIdx, { duration_minutes: parseInt(val) })}
                          className="h-8 w-16 bg-transparent border-none text-xs font-bold focus-visible:ring-0 p-0"
                          readOnly={readOnly}
                        />
                        <span className="text-[10px] uppercase font-bold tracking-wider">min</span>
                      </div>
                    </div>
                    {!readOnly && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-slate-300 hover:text-red-500 rounded-lg"
                        onClick={() => handleRemovePeriod(dIdx, pIdx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <CardContent className="p-5 space-y-3">
                    {(period.tasks || []).map((task, tIdx) => (
                      <div key={tIdx} className="group flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:border-slate-200 hover:shadow-md hover:shadow-slate-200/40 transition-all">
                        <div className="pt-1">
                          {task.task_type === 'mcq' ? <CheckSquare className="h-5 w-5 text-violet-500" /> : 
                           task.task_type === 'memorise' ? <BookOpen className="h-5 w-5 text-blue-500" /> :
                           <HelpCircle className="h-5 w-5 text-slate-400" />}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <EditableField 
                              value={task.title}
                              onBlur={(val: string) => handleUpdateTask(dIdx, pIdx, tIdx, { title: val })}
                              className="h-7 bg-transparent border-none font-bold text-sm text-slate-800 p-0 focus-visible:ring-0"
                              placeholder="Task Title"
                              readOnly={readOnly}
                            />
                            <div className="flex items-center gap-2">
                                <Select 
                                  value={task.task_type} 
                                  onValueChange={(val) => handleUpdateTask(dIdx, pIdx, tIdx, { task_type: val as TaskType })}
                                  disabled={readOnly}
                                >
                                <SelectTrigger className="h-6 w-24 text-[10px] uppercase font-black tracking-wider border-none bg-slate-100 rounded-lg focus:ring-0 shadow-none">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="memorise">Memorise</SelectItem>
                                  <SelectItem value="review">Review</SelectItem>
                                  <SelectItem value="recite">Recite</SelectItem>
                                  <SelectItem value="mcq">Quiz (MCQ)</SelectItem>
                                  <SelectItem value="written">Written</SelectItem>
                                </SelectContent>
                              </Select>
                              {!readOnly && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleRemoveTask(dIdx, pIdx, tIdx)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <EditableField 
                            value={task.description || ''}
                            onBlur={(val: string) => handleUpdateTask(dIdx, pIdx, tIdx, { description: val })}
                            className="h-6 bg-transparent border-none text-xs text-slate-500 p-0 focus-visible:ring-0"
                            placeholder="Add instructions or description..."
                            readOnly={readOnly}
                          />
                          
                          {task.task_type === 'mcq' && (
                            <div className="pt-2">
                               <Button 
                                 variant="outline" 
                                 size="sm" 
                                 className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-dashed border-violet-200 text-violet-600 hover:bg-violet-50"
                                 onClick={() => setActiveMCQTask({ dIdx, pIdx, tIdx })}
                               >
                                 Configure MCQ ({task.config?.questions?.length || 0} Questions)
                               </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {!readOnly && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full h-10 border border-dashed border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-100 rounded-xl font-bold text-xs gap-2"
                        onClick={() => handleAddTask(dIdx, pIdx)}
                      >
                        <Plus className="h-4 w-4" /> Add Task
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {!readOnly && (
                <Button 
                  variant="outline" 
                  className="w-full py-6 border-dashed border-slate-300 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 rounded-2xl font-black text-sm gap-2"
                  onClick={() => handleAddPeriod(dIdx)}
                >
                  <Plus className="h-5 w-5" /> Add New Period
                </Button>
              )}
            </div>
          )}
        </div>
      ))}

      {!readOnly && !onAddPeriod && ( // In admin mode (no real-time callbacks), show add day button
        <Button 
          onClick={addDay}
          className="w-full py-8 bg-slate-900 hover:bg-slate-800 text-white rounded-3xl font-black text-lg shadow-xl shadow-slate-200 flex items-center justify-center gap-3 transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <Plus className="h-6 w-6" /> Add Next Day
        </Button>
      )}

      {/* MCQ Config Modal */}
      {activeMCQTask && (
        <MCQConfigModal 
          isOpen={!!activeMCQTask}
          onClose={() => setActiveMCQTask(null)}
          config={days[activeMCQTask.dIdx].periods[activeMCQTask.pIdx].tasks[activeMCQTask.tIdx].config}
          onSave={(config) => {
            handleUpdateTask(activeMCQTask.dIdx, activeMCQTask.pIdx, activeMCQTask.tIdx, { config });
          }}
        />
      )}
    </div>
  );
}
