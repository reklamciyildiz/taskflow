'use client';

/**
 * Voice-to-Task Button Component
 * Records audio and creates tasks from voice input
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mic, Square, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VoiceToTaskButtonProps {
  onTaskCreated?: (task: {
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;
    assignees?: string[];
    tags?: string[];
  }) => void;
  className?: string;
}

export function VoiceToTaskButton({ onTaskCreated, className }: VoiceToTaskButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcription, setTranscription] = useState('');
  const [extractedTask, setExtractedTask] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      setTranscription('');
      setExtractedTask(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Determine best audio format
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        // Process audio
        await processAudio(audioBlob);
      };

      // Start recording with timeslice for smaller chunks
      mediaRecorder.start(1000); // 1 second chunks
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Microphone access denied. Please check your browser permissions.');
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', 'tr');

      // Send to API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch('/api/ai/voice-to-task', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Request failed');
      }

      // Set results
      setTranscription(result.data.transcription);
      setExtractedTask(result.data.extractedTask);

      // Notify parent
      if (onTaskCreated) {
        onTaskCreated(result.data.extractedTask);
      }

      toast.success('Action created successfully');
    } catch (err) {
      console.error('Failed to process audio:', err);
      
      let errorMessage = 'Something went wrong';
      
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'Request timed out. Please try again.';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          errorMessage =
            'Network error. Check your connection or make sure AI features are enabled.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClose = () => {
    if (isRecording) {
      stopRecording();
    }
    setIsOpen(false);
    setRecordingTime(0);
    setTranscription('');
    setExtractedTask(null);
    setError(null);
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={cn('gap-2', className)}
        variant="outline"
      >
        <Mic className="h-4 w-4" />
        Create action with voice
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>🎤 Create action with voice</DialogTitle>
            <DialogDescription>
              Speak into your microphone. AI will extract the action details automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Recording Controls */}
            {!extractedTask && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                {/* Recording Button */}
                <div className="relative">
                  <Button
                    size="lg"
                    variant={isRecording ? 'destructive' : 'default'}
                    className={cn(
                      'h-24 w-24 rounded-full transition-all',
                      isRecording && 'animate-pulse'
                    )}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : isRecording ? (
                      <Square className="h-8 w-8" />
                    ) : (
                      <Mic className="h-8 w-8" />
                    )}
                  </Button>

                  {/* Recording indicator */}
                  {isRecording && (
                    <div className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>

                {/* Status Text */}
                <div className="text-center space-y-2">
                  {isProcessing ? (
                    <>
                      <p className="text-lg font-medium">Processing...</p>
                      <p className="text-sm text-muted-foreground">
                        AI is extracting the action details
                      </p>
                    </>
                  ) : isRecording ? (
                    <>
                      <p className="text-lg font-medium">{formatTime(recordingTime)}</p>
                      <p className="text-sm text-muted-foreground">
                        Recording... Click to stop
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-medium">Ready to record</p>
                      <p className="text-sm text-muted-foreground">
                        Click the microphone button to start
                      </p>
                    </>
                  )}
                </div>

                {/* Max duration warning */}
                {isRecording && recordingTime >= 240 && (
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>Approaching the maximum duration (5 minutes)</span>
                  </div>
                )}
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Error</p>
                    <p className="text-sm text-destructive/90">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Transcription Display */}
            {transcription && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Transcript</h4>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p className="italic">"{transcription}"</p>
                </div>
              </div>
            )}

            {/* Extracted action preview */}
            {extractedTask && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Action created</span>
                </div>

                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Title</p>
                    <p className="font-medium">{extractedTask.title}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{extractedTask.description}</p>
                  </div>

                  {extractedTask.priority && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Priority</p>
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-1 rounded text-xs font-medium',
                          extractedTask.priority === 'high' &&
                            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                          extractedTask.priority === 'medium' &&
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
                          extractedTask.priority === 'low' &&
                            'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        )}
                      >
                        {extractedTask.priority === 'high' && 'High'}
                        {extractedTask.priority === 'medium' && 'Medium'}
                        {extractedTask.priority === 'low' && 'Low'}
                      </span>
                    </div>
                  )}

                  {extractedTask.assignees && extractedTask.assignees.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Assignees</p>
                      <div className="flex flex-wrap gap-1">
                        {extractedTask.assignees.map((assignee: string, index: number) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded bg-primary/10 text-xs"
                          >
                            {assignee}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {extractedTask.tags && extractedTask.tags.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {extractedTask.tags.map((tag: string, index: number) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded bg-secondary text-xs"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Button onClick={handleClose} className="w-full">
                  Kapat
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
