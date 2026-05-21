import { useState, useRef } from 'react';
import { Upload, Loader2, Send, CheckCircle2, AlertCircle, Mic, Square, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { LiveWaveform } from '@/components/ui/live-waveform';
import toast from 'react-hot-toast';
import api from '@/services/api';

interface TaskSubmissionModalProps {
  task: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TaskSubmissionModal({ task, isOpen, onClose, onSuccess }: TaskSubmissionModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState({
    submission_text: '',
    mcq_answers: {} as Record<string, string>,
    media_url: ''
  });
  const [result, setResult] = useState<any>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setRecordingStream(stream);
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
        setRecordingStream(null);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let finalAudioUrl = null;
      if (audioBlob) {
        // Convert blob to base64 for submission (matching competition pattern)
        const reader = new FileReader();
        finalAudioUrl = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(audioBlob);
        });
      }

      const payload = {
        content: {
          submission_text: submission.submission_text,
          responses: task.task_type === 'mcq' 
            ? Object.entries(submission.mcq_answers).map(([idx, ans]) => ({ index: parseInt(idx), answer: parseInt(ans) }))
            : null,
          media_url: submission.media_url
        },
        audio_url: finalAudioUrl
      };
      
      const res = await api.post(`/student/tasks/${task.id}/submit`, payload);
      const data = res.data.data;
      
      if (task.task_type === 'mcq') {
        setResult(data);
        toast.success("MCQ submitted! Your teacher will review and share the results.");
      } else {
        toast.success("Submission received! Teacher will review soon.");
        onSuccess();
        onClose();
      }
    } catch (err) {
      toast.error("Failed to submit task");
    } finally {
      setSubmitting(false);
    }
  };

  const renderContent = () => {
    if (result) {
      return (
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-3xl border border-slate-100 text-center">
            <div className="h-20 w-20 rounded-full flex items-center justify-center mb-4 bg-blue-100 text-blue-600">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-900">Submitted for Review!</h3>
            <p className="text-slate-500 font-bold mt-1">Your teacher will review your answers and share the results.</p>
          </div>
          
          <Button onClick={() => { onSuccess(); onClose(); }} className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black">
            Done
          </Button>
        </div>
      );
    }

    if (task.task_type === 'mcq') {
      const config = task.config || { questions: [] };
      return (
        <div className="space-y-8 py-4">
          {config.questions.map((q: any, idx: number) => (
            <div key={idx} className="space-y-4">
              <div className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs">
                  {idx + 1}
                </span>
                <p className="text-lg font-bold text-slate-900 leading-snug">{q.question}</p>
              </div>
              <RadioGroup 
                value={submission.mcq_answers[idx] || ''} 
                onValueChange={(val) => setSubmission({
                  ...submission,
                  mcq_answers: { ...submission.mcq_answers, [idx]: val }
                })}
                className="grid gap-3 ml-12"
              >
                {q.options.map((opt: string, optIdx: number) => {
                  const isSelected = submission.mcq_answers[idx] === optIdx.toString();
                  return (
                    <Label 
                      key={optIdx} 
                      className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${isSelected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <RadioGroupItem value={optIdx.toString()} className="sr-only" />
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-blue-600' : 'border-slate-300'}`}>
                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                      </div>
                      <span className="font-bold text-slate-700">{opt}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>
          ))}
          <Button 
            onClick={handleSubmit} 
            disabled={submitting || Object.keys(submission.mcq_answers).length < config.questions.length} 
            className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-200"
          >
            {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Submit Answers"}
          </Button>
        </div>
      );
    }

    if (task.task_type === 'recite') {
      return (
        <div className="space-y-8 py-4">
          <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className={`h-24 w-24 rounded-full flex items-center justify-center mb-6 transition-all ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : audioUrl ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
              <Mic className="h-10 w-10" />
            </div>
            
            {isRecording ? (
              <div className="space-y-4">
                <h3 className="text-xl font-black text-slate-900">Recording In Progress...</h3>
                <p className="text-slate-500 font-medium">Recite clearly into your microphone.</p>
                <LiveWaveform
                  active
                  mode="scrolling"
                  stream={recordingStream}
                  height={60}
                  className="rounded-xl bg-white"
                />
                <Button 
                  onClick={stopRecording}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-2xl px-8 h-14 font-black text-lg shadow-xl shadow-red-200"
                >
                  <Square className="h-5 w-5 mr-2 fill-current" /> Stop Recording
                </Button>
              </div>
            ) : audioUrl ? (
              <div className="space-y-6 w-full">
                <h3 className="text-xl font-black text-slate-900">Recitation Recorded!</h3>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <audio src={audioUrl} controls className="w-full h-12" />
                </div>
                <div className="flex gap-3 justify-center">
                  <Button 
                    onClick={startRecording}
                    variant="outline"
                    className="rounded-xl font-bold border-slate-200"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Re-record
                  </Button>
                  <Button 
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-8 font-black shadow-lg shadow-blue-200"
                  >
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Send className="h-5 w-5 mr-2" /> Submit Recitation</>}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-xl font-black text-slate-900">Ready to Record</h3>
                <p className="text-slate-500 font-medium leading-relaxed">Click the button below and start reciting your assigned passage.</p>
                <Button 
                  onClick={startRecording}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-10 h-16 font-black text-xl shadow-xl shadow-blue-200"
                >
                  <Mic className="h-6 w-6 mr-2" /> Start Recording
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Additional Notes (Optional)</Label>
            <Textarea 
              placeholder="Any comments for your teacher..."
              value={submission.submission_text}
              onChange={(e) => setSubmission({ ...submission, submission_text: e.target.value })}
              className="rounded-2xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 font-medium"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 py-4">
        <div className="space-y-2">
          <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Notes or Text Submission</Label>
          <Textarea 
            placeholder="Type your response here..."
            value={submission.submission_text}
            onChange={(e) => setSubmission({ ...submission, submission_text: e.target.value })}
            className="min-h-[150px] rounded-2xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 font-medium"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Media/Attachment Link</Label>
          <div className="relative">
            <Input 
              placeholder="Google Drive link, Loom, or Image URL"
              value={submission.media_url}
              onChange={(e) => setSubmission({ ...submission, media_url: e.target.value })}
              className="h-14 pl-12 rounded-2xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 font-bold"
            />
            <Upload className="absolute left-4 top-4 h-6 w-6 text-slate-300" />
          </div>
        </div>

        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
            Please ensure any external links (Drive/Dropbox) have the "Anyone with link" permission enabled for teacher review.
          </p>
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={submitting || (!submission.submission_text && !submission.media_url)} 
          className="w-full h-16 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg"
        >
          {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Submit Work"}
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] rounded-[2rem] overflow-hidden p-0 border-none">
        <DialogHeader className="bg-slate-900 text-white p-8 text-left">
          <div className="flex items-center gap-3 mb-2">
            <Send className="h-5 w-5 text-blue-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Task Submission</span>
          </div>
          <DialogTitle className="text-2xl font-black">{task.title}</DialogTitle>
          <p className="text-slate-400 text-sm mt-1">Submit your progress for evaluation by your teacher.</p>
        </DialogHeader>
        <div className="p-8 max-h-[70vh] overflow-y-auto">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
