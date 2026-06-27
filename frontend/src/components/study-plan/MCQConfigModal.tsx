import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface MCQQuestion {
  question: string;
  options: string[];
  correct_option: number;
}

interface MCQConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: { questions: MCQQuestion[] };
  onSave: (config: { questions: MCQQuestion[] }) => void;
}

export default function MCQConfigModal({ isOpen, onClose, config, onSave }: MCQConfigModalProps) {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<MCQQuestion[]>(
    (config?.questions?.length || 0) > 0 ? config.questions : [{ question: '', options: ['', '', '', ''], correct_option: 0 }]
  );

  const addQuestion = () => {
    setQuestions([...questions, { question: '', options: ['', '', '', ''], correct_option: 0 }]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, updates: Partial<MCQQuestion>) => {
    const newQuestions = [...questions];
    newQuestions[idx] = { ...newQuestions[idx], ...updates };
    setQuestions(newQuestions);
  };

  const updateOption = (qIdx: number, oIdx: number, val: string) => {
    const newQuestions = [...questions];
    newQuestions[qIdx].options[oIdx] = val;
    setQuestions(newQuestions);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-slate-900">{t('studyPlan.mcqTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-8 py-4">
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 block">{t('studyPlan.question', { n: qIdx + 1 })}</Label>
                  <Input 
                    value={q.question} 
                    onChange={(e) => updateQuestion(qIdx, { question: e.target.value })}
                    placeholder={t('studyPlan.questionPlaceholder')}
                    className="font-bold text-slate-800 rounded-xl"
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => removeQuestion(qIdx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                    <button 
                      onClick={() => updateQuestion(qIdx, { correct_option: oIdx })}
                      className="shrink-0"
                    >
                      {q.correct_option === oIdx ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                      ) : (
                        <Circle className="h-6 w-6 text-slate-200 hover:text-slate-300" />
                      )}
                    </button>
                    <Input 
                      value={opt} 
                      onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                      placeholder={t('studyPlan.optionLabel', { letter: String.fromCharCode(65 + oIdx) })}
                      className="border-none bg-transparent h-8 focus-visible:ring-0 text-sm font-medium p-0"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <Button 
            variant="outline" 
            className="w-full py-6 border-dashed border-slate-300 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-2xl font-black gap-2"
            onClick={addQuestion}
          >
            <Plus className="h-5 w-5" /> {t('studyPlan.addQuestionBtn')}
          </Button>
        </div>

        <DialogFooter className="sticky bottom-0 bg-white pt-4">
          <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold">{t('common.cancel')}</Button>
          <Button onClick={() => { onSave({ questions }); onClose(); }} className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700">{t('studyPlan.saveQuizConfig')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
