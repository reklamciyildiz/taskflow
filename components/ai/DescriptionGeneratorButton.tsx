'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { parseSafeDescription } from '@/lib/ai/utils/safe-description';

interface DescriptionGeneratorButtonProps {
  taskTitle: string;
  taskId?: string;
  existingDescription?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  onDescriptionGenerated?: (description: string) => void;
  className?: string;
}

export function DescriptionGeneratorButton({
  taskTitle,
  taskId,
  existingDescription,
  priority,
  tags,
  onDescriptionGenerated,
  className,
}: DescriptionGeneratorButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDescription, setGeneratedDescription] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/description-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle,
          taskId,
          context: {
            existingDescription,
            priority,
            tags,
          },
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to generate description');
      }

      setGeneratedDescription(result.data.generatedDescription);
      
      if (onDescriptionGenerated) {
        onDescriptionGenerated(result.data.generatedDescription);
      }

      toast.success('Description generated successfully');
    } catch (err) {
      console.error('[AI Description] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedDescription);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Description copied to clipboard');
  };

  const handleUse = () => {
    if (onDescriptionGenerated) {
      onDescriptionGenerated(generatedDescription);
    }
    setIsOpen(false);
    toast.success('Description has been applied to the task');
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={cn('gap-2', className)}
        variant="outline"
        size="sm"
      >
        <Sparkles className="h-4 w-4" />
        AI Generate
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>✨ AI Description Generator</DialogTitle>
            <DialogDescription>
              Generate a comprehensive action description with AI
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Action title:</p>
              <p className="text-sm text-muted-foreground italic">"{taskTitle}"</p>
            </div>

            {!generatedDescription && (
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Description
                  </>
                )}
              </Button>
            )}

            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {generatedDescription && (
              <div className="space-y-4">
                <div className="max-h-[400px] space-y-2 overflow-y-auto rounded-lg bg-muted p-4">
                  {parseSafeDescription(generatedDescription).map((block, index) => {
                    if (block.type === 'heading') {
                      return <h3 key={index} className="pt-2 font-semibold first:pt-0">{block.text}</h3>;
                    }
                    if (block.type === 'list-item') {
                      return <div key={index} className="flex gap-2 text-sm"><span aria-hidden>•</span><span>{block.text}</span></div>;
                    }
                    return <p key={index} className="text-sm leading-relaxed">{block.text}</p>;
                  })}
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleCopy} variant="outline" className="flex-1">
                    {copied ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button onClick={handleUse} className="flex-1">
                    Use This Description
                  </Button>
                </div>

                <Button
                  onClick={() => {
                    setGeneratedDescription('');
                    handleGenerate();
                  }}
                  variant="ghost"
                  size="sm"
                  className="w-full"
                >
                  Regenerate
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
