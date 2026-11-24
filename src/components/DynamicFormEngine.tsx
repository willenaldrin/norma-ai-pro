'use client';

import React, { useState } from 'react';
import { construirPromptCampo } from '@/lib/prompt-asistente';
import AsistentePromptPegarModal, {
  ContextoGeneracionCampo,
} from '@/components/AsistentePromptPegarModal';

export interface CampoEsquema {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'table';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  columns?: { id: string; label: string; type?: 'text' | 'select'; options?: string[] }[];
  aiPromptHint?: string;
}

export interface SeccionEsquema {
  id: string;
  title: string;
  description?: string;
  fields: CampoEsquema[];
}

export interface EsquemaNorma {
  sections: SeccionEsquema[];
}

interface DynamicFormEngineProps {
  schema: EsquemaNorma;
  initialData?: Record<string, any>;
  normaNombre: string;
  clienteNombre: string;
  clienteSector?: string;
  onSave: (formData: Record<string, any>) => Promise<void>;
  onGenerateDocs?: (formData: Record<string, any>) => Promise<void>;
}

interface EstadoModalPrompt {
  abierto: boolean;
  campoId: string;
  campoLabel: string;
  promptGenerado: string;
  valorActual: string;
  contextoGeneracion?: ContextoGeneracionCampo;
}

export default function DynamicFormEngine({
  schema,
  initialData = {},
  normaNombre,
  clienteNombre,
  clienteSector = '',
  onSave,
  onGenerateDocs,
}: DynamicFormEngineProps) {
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [loadingField, setLoadingField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [modalPrompt, setModalPrompt] = useState<EstadoModalPrompt>({
    abierto: false,
    campoId: '',
    campoLabel: '',
    promptGenerado: '',
    valorActual: '',
    contextoGeneracion: undefined,
  });

  const sections = schema?.sections || [];
  const currentSection = sections[activeSectionIdx];

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  // Gestión de filas en tablas dinámicas (ej. Inventario de Activos / Matriz MAGERIT)
  const handleAddTableRow = (field: CampoEsquema) => {
    const currentRows: Record<string, string>[] = Array.isArray(formData[field.id]) ? formData[field.id] : [];
    const newRow: Record<string, string> = {};
    (field.columns || []).forEach((col) => {
      newRow[col.id] = col.options && col.options.length > 0 ? col.options[0] : '';
    });
    handleFieldChange(field.id, [...currentRows, newRow]);
  };

  const handleUpdateTableRow = (fieldId: string, rowIdx: number, colId: string, value: string) => {
    const currentRows: Record<string, string>[] = Array.isArray(formData[fieldId]) ? [...formData[fieldId]] : [];
    currentRows[rowIdx] = {
      ...currentRows[rowIdx],
      [colId]: value,
    };
    handleFieldChange(fieldId, currentRows);
  };

  const handleRemoveTableRow = (fieldId: string, rowIdx: number) => {
    const currentRows: Record<string, string>[] = Array.isArray(formData[fieldId]) ? [...formData[fieldId]] : [];
    currentRows.splice(rowIdx, 1);
    handleFieldChange(fieldId, currentRows);
  };

  // Llamada al endpoint de IA para autocompletar un campo individual
  const handleAutocompleteField = async (field: CampoEsquema) => {
    setLoadingField(field.id);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/generar-campo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normaNombre,
          clienteNombre,
          clienteSector,
          seccionTitulo: currentSection?.title || '',
          campoLabel: field.label,
          aiPromptHint: field.aiPromptHint || '',
          contextoActual: formData,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al autocompletar con IA');
      }

      handleFieldChange(field.id, data.suggestion);
    } catch (error: any) {
      setStatusMessage({
        type: 'err',
        text: error.message || 'No se pudo generar la sugerencia con IA.',
      });
    } finally {
      setLoadingField(null);
    }
  };

  // Abre el modal con el prompt preparado y genera automáticamente la respuesta en el cuadro 2
  const handleOpenPromptModal = (field: CampoEsquema) => {
    const contextoGen: ContextoGeneracionCampo = {
      normaNombre,
      clienteNombre,
      clienteSector,
      seccionTitulo: currentSection?.title || '',
      campoLabel: field.label,
      aiPromptHint: field.aiPromptHint || '',
      contextoActual: formData,
    };

    const promptGenerado = construirPromptCampo(contextoGen);

    setModalPrompt({
      abierto: true,
      campoId: field.id,
      campoLabel: field.label,
      promptGenerado,
      valorActual: String(formData[field.id] || ''),
      contextoGeneracion: contextoGen,
    });
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      await onSave(formData);
      setStatusMessage({ type: 'ok', text: 'Borrador guardado correctamente en Supabase.' });
    } catch (error: any) {
      setStatusMessage({ type: 'err', text: error.message || 'Error al guardar el borrador.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerGenerate = async () => {
    if (!onGenerateDocs) return;
    setGenerating(true);
    setStatusMessage(null);
    try {
      // CORRECCIÓN: Eliminamos el await onSave(formData) duplicado aquí.
      // Confíamos en que onGenerateDocs recibirá el formData actual (que incluye
      // las ediciones manuales del usuario sobre el borrador de contingencia)
      // y se encargará de la persistencia final si es necesario.
      await onGenerateDocs(formData);
      // Opcional: Mostrar mensaje de éxito aquí, o dejar que onGenerateDocs lo maneje.
    } catch (error: any) {
      setStatusMessage({ type: 'err', text: error.message || 'Error al generar documentación.' });
      // IMPORTANTE: Asegúrate de detener el estado de carga si hay error.
    } finally {
      setGenerating(false);
    }
  };

  if (sections.length === 0) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
        Esta plantilla aún no tiene secciones definidas en su esquema JSON.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Navegación superior por pestañas/secciones */}
      <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 pt-3 gap-2">
        {sections.map((sec, idx) => {
          const isActive = idx === activeSectionIdx;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSectionIdx(idx)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-white text-blue-700 border-t border-x border-slate-200 -mb-px shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {idx + 1}. {sec.title}
            </button>
          );
        })}
      </div>

      {/* Cuerpo de la sección activa */}
      <div className="p-6 md:p-8 space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-xl font-bold text-slate-900">{currentSection.title}</h2>
          {currentSection.description && (
            <p className="text-sm text-slate-500 mt-1">{currentSection.description}</p>
          )}
        </div>

        {statusMessage && (
          <div
            className={`p-3.5 rounded-xl text-sm font-medium ${
              statusMessage.type === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <div className="space-y-6">
          {currentSection.fields.map((field) => (
            <div key={field.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-semibold text-slate-800">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>

                {(field.type === 'text' || field.type === 'textarea') && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenPromptModal(field)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 transition"
                    >
                      📋 Copiar / Pegar
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAutocompleteField(field)}
                      disabled={loadingField === field.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50"
                    >
                      {loadingField === field.id ? '⏳ Generando...' : '✨ Autocompletar con IA'}
                    </button>
                  </div>
                )}
              </div>

              {field.type === 'text' && (
                <input
                  type="text"
                  value={formData[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  placeholder={field.placeholder || ''}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                />
              )}

              {field.type === 'textarea' && (
                <textarea
                  rows={4}
                  value={formData[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  placeholder={field.placeholder || ''}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                />
              )}

              {field.type === 'select' && (
                <select
                  value={formData[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                >
                  <option value="">Selecciona una opción...</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}

              {field.type === 'checkbox' && (
                <label className="inline-flex items-center gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(formData[field.id])}
                    onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">{field.placeholder || 'Confirmado / Aplica'}</span>
                </label>
              )}

              {field.type === 'table' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          {(field.columns || []).map((col) => (
                            <th
                              key={col.id}
                              className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                            >
                              {col.label}
                            </th>
                          ))}
                          <th className="px-3 py-2.5 w-16 text-right text-xs font-semibold text-slate-600">
                            Acción
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {(Array.isArray(formData[field.id]) ? formData[field.id] : []).map(
                          (row: Record<string, string>, rIdx: number) => (
                            <tr key={rIdx}>
                              {(field.columns || []).map((col) => (
                                <td key={col.id} className="px-3 py-2">
                                  {col.type === 'select' ? (
                                    <select
                                      value={row[col.id] || ''}
                                      onChange={(e) =>
                                        handleUpdateTableRow(field.id, rIdx, col.id, e.target.value)
                                      }
                                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                                    >
                                      {(col.options || []).map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={row[col.id] || ''}
                                      onChange={(e) =>
                                        handleUpdateTableRow(field.id, rIdx, col.id, e.target.value)
                                      }
                                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                                    />
                                  )}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTableRow(field.id, rIdx)}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                                >
                                  Borrar
                                </button>
                              </td>
                            </tr>
                          )
                        )}
                        {(!Array.isArray(formData[field.id]) || formData[field.id].length === 0) && (
                          <tr>
                            <td
                              colSpan={(field.columns?.length || 1) + 1}
                              className="px-4 py-6 text-center text-xs text-slate-400"
                            >
                              No hay filas registradas aún. Pulsa &ldquo;+ Añadir fila&rdquo; para empezar.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleAddTableRow(field)}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                    >
                      + Añadir fila
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Barra inferior de navegación y acciones */}
        <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={activeSectionIdx === 0}
              onClick={() => setActiveSectionIdx((prev) => Math.max(0, prev - 1))}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              disabled={activeSectionIdx === sections.length - 1}
              onClick={() => setActiveSectionIdx((prev) => Math.min(sections.length - 1, prev + 1))}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || generating}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : '💾 Guardar Borrador'}
            </button>

            {onGenerateDocs && (
              <button
                type="button"
                onClick={handleTriggerGenerate}
                disabled={saving || generating}
                className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-xs transition disabled:opacity-50"
              >
                {generating ? '⏳ Generando Paquete ISO...' : '🚀 Generar Documentos con IA'}
              </button>
            )}
          </div>
        </div>
      </div>

      <AsistentePromptPegarModal
        abierto={modalPrompt.abierto}
        onClose={() => setModalPrompt((prev) => ({ ...prev, abierto: false }))}
        campoLabel={modalPrompt.campoLabel}
        promptGenerado={modalPrompt.promptGenerado}
        valorActualCampo={modalPrompt.valorActual}
        contextoGeneracion={modalPrompt.contextoGeneracion}
        onAplicarTexto={(textoFinal) => {
          if (modalPrompt.campoId) {
            handleFieldChange(modalPrompt.campoId, textoFinal);
          }
        }}
      />
    </div>
  );
}