'use client';

import React, { useEffect, useState } from 'react';

export interface ContextoGeneracionCampo {
  normaNombre: string;
  clienteNombre: string;
  clienteSector?: string;
  seccionTitulo: string;
  campoLabel: string;
  aiPromptHint?: string;
  contextoActual?: Record<string, any>;
}

interface AsistentePromptPegarModalProps {
  abierto: boolean;
  onClose: () => void;
  campoLabel?: string;
  promptGenerado: string;
  valorActualCampo?: string;
  contextoGeneracion?: ContextoGeneracionCampo;
  onAplicarTexto: (textoFinal: string) => void;
}

export default function AsistentePromptPegarModal({
  abierto,
  onClose,
  campoLabel,
  promptGenerado,
  valorActualCampo = '',
  contextoGeneracion,
  onAplicarTexto,
}: AsistentePromptPegarModalProps) {
  const [copiado, setCopiado] = useState(false);
  const [respuestaPegada, setRespuestaPegada] = useState('');
  const [generandoApi, setGenerandoApi] = useState(false);
  const [estadoApi, setEstadoApi] = useState<string | null>(null);
  const [modoInsercion, setModoInsercion] = useState<'reemplazar' | 'anadir'>('reemplazar');

  useEffect(() => {
    if (!abierto) return;
    setCopiado(false);
    setRespuestaPegada('');
    setEstadoApi(null);
    setModoInsercion('reemplazar');
  }, [abierto, promptGenerado]);

  if (!abierto) return null;

  const handleCopiarPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptGenerado);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = promptGenerado;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  const handleCopiarYAbrirGemini = async () => {
    await handleCopiarPrompt();
    window.open('https://gemini.google.com/app', '_blank', 'noopener,noreferrer');
  };

  const handleGenerarConApiOpcional = async () => {
    if (!contextoGeneracion) return;
    setGenerandoApi(true);
    setEstadoApi(null);

    try {
      const response = await fetch('/api/generar-campo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normaNombre: contextoGeneracion.normaNombre,
          clienteNombre: contextoGeneracion.clienteNombre,
          clienteSector: contextoGeneracion.clienteSector || '',
          seccionTitulo: contextoGeneracion.seccionTitulo,
          campoLabel: contextoGeneracion.campoLabel,
          aiPromptHint: contextoGeneracion.aiPromptHint || '',
          contextoActual: contextoGeneracion.contextoActual || {},
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo generar con la API.');
      }

      if (data?.suggestion) {
        setRespuestaPegada(String(data.suggestion));
        setEstadoApi(
          data?.modeloUsado === 'contingencia-estructurada'
            ? 'Se cargó un borrador de contingencia (sin cuota API disponible en este momento).'
            : `Propuesta generada vía API (${data.modeloUsado || 'Gemini'}).`
        );
      }
    } catch (error: any) {
      setEstadoApi(error?.message || 'Error al consultar la API.');
    } finally {
      setGenerandoApi(false);
    }
  };

  const handleInsertar = () => {
    const limpio = respuestaPegada.trim();
    if (!limpio) return;

    if (modoInsercion === 'anadir' && valorActualCampo.trim()) {
      onAplicarTexto(`${valorActualCampo.trim()}\n\n${limpio}`);
    } else {
      onAplicarTexto(limpio);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              Flujo asistido con Gemini Web
            </p>
            <h3 className="text-base font-bold text-slate-900">
              Prompt y respuesta · {campoLabel || 'Campo'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-sm font-semibold px-2 py-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700">
                1. Prompt preparado (pregunta lista para enviar)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopiarPrompt}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 transition"
                >
                  {copiado ? '✓ Prompt copiado' : '📋 Copiar prompt'}
                </button>
                <button
                  type="button"
                  onClick={handleCopiarYAbrirGemini}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                >
                  ↗ Copiar y abrir gemini.google.com
                </button>
              </div>
            </div>
            <textarea
              readOnly
              rows={6}
              value={promptGenerado}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 leading-relaxed focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="respuesta-pegar-ia"
                className="text-xs font-semibold text-slate-700"
              >
                2. Respuesta redactada (pega aquí lo que devuelva gemini.google.com)
              </label>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                {contextoGeneracion && (
                  <button
                    type="button"
                    onClick={handleGenerarConApiOpcional}
                    disabled={generandoApi}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50"
                  >
                    {generandoApi ? '⏳ Consultando API...' : '⚡ Pedir borrador vía API'}
                  </button>
                )}

                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="modoInsercion"
                    checked={modoInsercion === 'reemplazar'}
                    onChange={() => setModoInsercion('reemplazar')}
                  />
                  <span>Reemplazar</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="modoInsercion"
                    checked={modoInsercion === 'anadir'}
                    onChange={() => setModoInsercion('anadir')}
                  />
                  <span>Añadir al final</span>
                </label>
              </div>
            </div>

            {estadoApi && (
              <p className="text-[11px] text-slate-500">{estadoApi}</p>
            )}

            <textarea
              id="respuesta-pegar-ia"
              rows={7}
              value={respuestaPegada}
              onChange={(e) => setRespuestaPegada(e.target.value)}
              placeholder="Pega aquí la respuesta de gemini.google.com o edítala libremente antes de insertarla..."
              className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-800 leading-relaxed focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-white transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!respuestaPegada.trim() || generandoApi}
            onClick={handleInsertar}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Insertar en el campo
          </button>
        </div>
      </div>
    </div>
  );
}