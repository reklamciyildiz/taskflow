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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

  const { toast } = useToast();

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

      toast({
        title: 'Success!',
        description: 'Description generated successfully',
      });
    } catch (err) {
      console.error('[AI Description] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedDescription);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Copied!',
      description: 'Description copied to clipboard',
    });
  };

  const handleUse = () => {
    if (onDescriptionGenerated) {
      onDescriptionGenerated(generatedDescription);
    }
    setIsOpen(false);
    toast({
      title: 'Applied!',
      description: 'Description has been applied to the task',
    });
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
                <div className="p-4 bg-muted rounded-lg max-h-[400px] overflow-y-auto">
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: generatedDescription
                        .replace(/## /g, '<h3 class="font-semibold mt-4 mb-2">')
                        .replace(/\n/g, '<br/>')
                        .replace(/<h3/g, '</p><h3')
                        .replace(/<br\/><br\/>/g, '</p><p class="mb-2">')
                        .replace(/^/, '<p class="mb-2">')
                        .replace(/$/, '</p>'),
                    }}
                  />
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
