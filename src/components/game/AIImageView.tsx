import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Props {
  prompt: string;
  onSubmit: (dataUrl: string) => void;
  disabled?: boolean;
}

/**
 * AI KÉP mód — egy gombnyomásra a Lovable AI Gateway
 * hyperrealisztikus képet készít a kapott szövegből.
 */
export default function AIImageView({ prompt, onSubmit, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ai-generate-image', {
        body: { prompt },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.image) throw new Error('Nem érkezett kép');
      setGenerated(data.image);
    } catch (e: any) {
      setError(e?.message || 'Hiba az AI képgenerálás során');
      toast({ title: 'AI hiba', description: e?.message || 'Próbáld újra.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setGenerated(null);
    setError(null);
  }, [prompt]);

  return (
    <div className="game-card flex flex-col items-center gap-3 p-4 w-full max-w-3xl">
      <h3 className="text-xl font-bold">🪄 AI KÉP MÓD</h3>
      <p className="text-sm text-muted-foreground text-center">
        Az AI hyperrealisztikus képet készít a szövegből. Generáld le, majd küldd be!
      </p>

      <div className="w-full bg-card/60 rounded-xl border border-border p-3 text-center">
        <p className="text-sm font-bold text-muted-foreground">Prompt:</p>
        <p className="text-lg font-bold">"{prompt || '...'}"</p>
      </div>

      {generated ? (
        <div className="w-full">
          <div className="border-2 border-border rounded-xl overflow-hidden bg-white">
            <img src={generated} alt="AI generated" className="w-full h-auto" />
          </div>
        </div>
      ) : (
        <div className="w-full h-64 flex items-center justify-center bg-muted/40 rounded-xl border-2 border-dashed border-border">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl animate-spin">⚙️</span>
              <span className="font-bold">AI rajzol... (10-30mp)</span>
            </div>
          ) : (
            <span className="text-muted-foreground font-bold">Még nincs kép</span>
          )}
        </div>
      )}

      {error && <p className="text-destructive font-bold text-sm">{error}</p>}

      <div className="flex gap-2 flex-wrap justify-center">
        <button
          type="button"
          className="game-btn-secondary"
          onClick={generate}
          disabled={loading || disabled}
        >
          {generated ? '🔁 Újra generál' : '🪄 Generálás'}
        </button>
        <button
          type="button"
          className="game-btn-primary"
          onClick={() => generated && onSubmit(generated)}
          disabled={!generated || disabled}
        >
          ✅ KÜLDÉS!
        </button>
      </div>
    </div>
  );
}