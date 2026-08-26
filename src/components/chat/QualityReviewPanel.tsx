import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import {
  getQualityReviewFn,
  reviewConversationFn,
  type QualityReviewDTO,
} from "@/functions/quality.functions";
import { captureDiagnostic } from "@/lib/diagnostics";

interface QualityReviewPanelProps {
  conversationId?: string | undefined;
  enabled: boolean;
}

const sentimentLabels: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Negativo",
};

export function QualityReviewPanel({ conversationId, enabled }: QualityReviewPanelProps) {
  const getReview = useServerFn(getQualityReviewFn);
  const reviewConversation = useServerFn(reviewConversationFn);
  const [review, setReview] = useState<QualityReviewDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !conversationId) return;
    setLoading(true);
    try {
      setReview(await getReview({ data: { conversationId } }));
      setError(null);
    } catch (cause) {
      setError("Não foi possível carregar a avaliação");
      captureDiagnostic(cause, {
        source: "async",
        component: "QualityReviewPanel",
        payload: { operation: "get_quality_review", conversationId },
        recoverable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [conversationId, enabled, getReview]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReview() {
    if (!conversationId || reviewing) return;
    setReviewing(true);
    try {
      setReview(await reviewConversation({ data: { conversationId } }));
      setError(null);
    } catch (cause) {
      setError("Não foi possível gerar a avaliação");
      captureDiagnostic(cause, {
        source: "async",
        component: "QualityReviewPanel",
        payload: { operation: "review_conversation", conversationId },
        recoverable: true,
      });
    } finally {
      setReviewing(false);
    }
  }

  if (!enabled || !conversationId) return null;

  return (
    <aside
      className="border-b border-violet-100 bg-violet-50 px-6 py-3 text-sm text-violet-950"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-violet-700" />
          <strong>QA do atendimento</strong>
          {review && (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold">
              Score {review.score}/100
            </span>
          )}
          {review && (
            <span className="text-xs text-violet-700">
              {sentimentLabels[review.sentiment] ?? review.sentiment}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || reviewing}
            className="rounded-lg p-1.5 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            title="Atualizar avaliação"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => void handleReview()}
            disabled={reviewing}
            className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {reviewing ? "Avaliando" : review ? "Reavaliar" : "Avaliar"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {review && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-white/70 p-3">
            <p className="text-xs font-bold uppercase text-violet-700">Resumo</p>
            <p className="mt-1 text-xs">{review.summary}</p>
          </div>
          <div className="rounded-lg bg-white/70 p-3">
            <p className="flex items-center gap-1 text-xs font-bold uppercase text-violet-700">
              <ShieldAlert className="h-3 w-3" /> Alertas
            </p>
            {review.policyViolations.length ? (
              <ul className="mt-1 space-y-1 text-xs">
                {review.policyViolations.map((item) => (
                  <li key={item} className="flex gap-1">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                Nenhuma violação detectada.
              </p>
            )}
          </div>
          <div className="rounded-lg bg-white/70 p-3">
            <p className="text-xs font-bold uppercase text-violet-700">Recomendações</p>
            {review.recommendations.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                {review.recommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs">Sem recomendações adicionais.</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
