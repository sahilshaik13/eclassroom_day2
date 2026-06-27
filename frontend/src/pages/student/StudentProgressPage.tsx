import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, CheckCircle2, Clock, Play, FileText, BarChart2, BadgeCheck, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import api from '@/services/api';
import { clsx } from 'clsx';
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels';
import { queryKeys } from '@/lib/queryKeys';
import { studyPlanQueryOptions } from '@/lib/studyPlanQueries';
import { useStudentProgressRealtime } from '@/hooks/useStudentProgressRealtime';

export default function StudentProgressPage() {
  const { t } = useTranslation();
  useStudentProgressRealtime();
  const navigate = useNavigate();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: queryKeys.student.classesMy(),
    queryFn: async () => {
      const res = await api.get('/student/classes/my');
      return res.data.data || [];
    },
    ...studyPlanQueryOptions(),
  });

  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  const effectiveClassId = selectedClassId ?? classes[0]?.id ?? null;

  const {
    data: studyPlan = null,
    isLoading: planLoading,
    isFetching: planFetching,
  } = useQuery({
    queryKey: queryKeys.student.classStudyPlan(effectiveClassId ?? ''),
    queryFn: async () => {
      const res = await api.get(`/student/classes/${effectiveClassId}/study-plan`);
      return res.data.data;
    },
    enabled: !!effectiveClassId,
    ...studyPlanQueryOptions(),
  });

  const stats = useMemo(() => {
    if (!studyPlan?.days) {
      return { total: 0, completed: 0, percentage: 0 };
    }
    let total = 0;
    let completed = 0;
    studyPlan.days.forEach((day: { periods: { tasks: { study_plan_submissions?: unknown[] }[] }[] }) => {
      day.periods.forEach((period) => {
        period.tasks.forEach((task) => {
          total++;
          if (task.study_plan_submissions && task.study_plan_submissions.length > 0) {
            completed++;
          }
        });
      });
    });
    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [studyPlan]);

  const showBlockingLoader =
    (classesLoading && classes.length === 0) ||
    (!!effectiveClassId && planLoading && !studyPlan);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-blue-600" />
            {t('student.progress.title')}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {t('student.progress.subtitle')}
            {planFetching && !showBlockingLoader && (
              <span className="ml-2 text-[10px] text-slate-400">· {t('common.updating')}</span>
            )}
          </p>
        </div>
        {classes.length > 1 && (
          <select
            value={effectiveClassId ?? ''}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
          >
            {classes.map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {showBlockingLoader ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          {t('student.progress.loading')}
        </div>
      ) : !studyPlan ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            {t('student.progress.noPlan')}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-blue-100 bg-blue-50/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">{t('student.progress.overallProgress')}</span>
                  <BarChart2 className="h-5 w-5 text-blue-600" />
                </div>
                <p className="text-3xl font-bold text-blue-900">{stats.percentage}%</p>
                <Progress value={stats.percentage} className="mt-3 h-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">{t('student.progress.completed')}</span>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-3xl font-bold text-slate-900">{stats.completed}</p>
                <p className="text-xs text-slate-500 mt-1">{t('student.progress.ofTasks', { total: stats.total })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">{t('student.progress.remaining')}</span>
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <p className="text-3xl font-bold text-slate-900">{stats.total - stats.completed}</p>
                <p className="text-xs text-slate-500 mt-1">{t('student.progress.tasksToGo')}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">{t('student.progress.studyPlanDays')}</h2>
              <div className="space-y-4">
                {studyPlan.days?.map((day: { day_number: number; periods: { title: string; tasks: { id: string; title: string; study_plan_submissions?: unknown[] }[] }[] }) => (
                  <div key={day.day_number} className="border border-slate-100 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-800 mb-3">{t('student.progress.day', { n: day.day_number })}</h3>
                    {day.periods?.map((period, pIdx) => (
                      <div key={pIdx} className="mb-3 last:mb-0">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">
                          {formatStudyPlanPeriodLabel(period.title)}
                        </p>
                        <ul className="space-y-2">
                          {period.tasks?.map((task) => {
                            const done =
                              task.study_plan_submissions &&
                              task.study_plan_submissions.length > 0;
                            return (
                              <li
                                key={task.id}
                                className={clsx(
                                  'flex items-center gap-2 text-sm rounded-lg px-3 py-2',
                                  done
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : 'bg-slate-50 text-slate-700',
                                )}
                              >
                                {done ? (
                                  <BadgeCheck className="h-4 w-4 shrink-0" />
                                ) : (
                                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                )}
                                {task.title}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <Button
                className="mt-6 w-full sm:w-auto"
                onClick={() => navigate('/student/classes')}
              >
                <Play className="h-4 w-4 mr-2" />
                {t('student.progress.openFullPlan')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
