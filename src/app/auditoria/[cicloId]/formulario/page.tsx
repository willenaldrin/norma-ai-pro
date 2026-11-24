'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DynamicFormEngine, { EsquemaNorma } from '@/components/DynamicFormEngine';

interface CicloDetalle {
  id: string;
  anio: number;
  estado?: string;
  respuestas_json?: Record<string, any>;
  clientes?: {
    nombre_empresa?: string;
    sector?: string;
    cif?: string;
  };
  normas_plantillas?: {
    codigo_norma?: string;
    nombre_visible?: string;
    esquema_json?: EsquemaNorma;
  };
}

const OPCIONES_DOCUMENTOS = [
  { codigo_doc: 'DOC-01', titulo: '01 · Alcance y Contexto del SGSI' },
  { codigo_doc: 'DOC-02', titulo: '02 · Política de Seguridad y Cumplimiento' },
  { codigo_doc: 'DOC-03', titulo: '03 · Inventario de Activos y Valoración MAGERIT' },
  { codigo_doc: 'DOC-04', titulo: '04 · Análisis y Tratamiento de Riesgos' },
  { codigo_doc: 'DOC-05', titulo: '05 · Declaración de Aplicabilidad (SoA)' },
];

function FormularioAuditoriaContenido() {
  const params = useParams<{ cicloId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const cicloId = params?.cicloId;

  const [ciclo, setCiclo] = useState<CicloDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [docsSeleccionados, setDocsSeleccionados] = useState<string[]>(['DOC-01']);

  const toggleDocumento = (codigo: string) => {
    setDocsSeleccionados((prev) =>
      prev.includes(codigo) ? prev.filter((item) => item !== codigo) : [...prev, codigo]
    );
  };

  useEffect(() => {
    const cargarCiclo = async () => {
      if (!cicloId) return;
      setLoading(true);
      setErrorMsg('');

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push('/');
          return;
        }

        const { data, error } = await supabase
          .from('ciclos_auditoria')
          .select('*, clientes(*), normas_plantillas(*)')
          .eq('id', cicloId)
          .single();

        if (error) throw error;
        setCiclo(data as unknown as CicloDetalle);
      } catch (err: any) {
        setErrorMsg(err.message || 'No se pudo cargar el ciclo de auditoría.');
      } finally {
        setLoading(false);
      }
    };

    cargarCiclo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloId]);

  const handleSaveDraft = async (formData: Record<string, any>) => {
    if (!cicloId) return;

    const { error } = await supabase
      .from('ciclos_auditoria')
      .update({
        respuestas_json: formData,
        estado: 'borrador',
      })
      .eq('id', cicloId);

    if (error) throw error;
  };

  const handleGenerateDocs = async (formData: Record<string, any>) => {
    if (!cicloId) return;

    if (docsSeleccionados.length === 0) {
      throw new Error('Selecciona al menos 1 documento antes de generar.');
    }

    const response = await fetch('/api/generar-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cicloId,
        datosFormulario: formData,
        documentosSeleccionados: docsSeleccionados,
      }),
    });

    const rawText = await response.text();
    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      throw new Error(
        rawText || `Respuesta vacía o no válida del servidor (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.error || `Error al generar documentos (HTTP ${response.status}).`
      );
    }

    router.push(`/auditoria/${cicloId}/visor`);
  };

  const normaObj = ciclo?.normas_plantillas;
  const normaNombre =
    normaObj?.nombre_visible || normaObj?.codigo_norma || 'Normativa de Cumplimiento';
  const esquemaNorma: EsquemaNorma = normaObj?.esquema_json || { sections: [] };
  const clienteNombre = ciclo?.clientes?.nombre_empresa || 'Cliente';
  const clienteSector = ciclo?.clientes?.sector || '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="text-blue-600 hover:underline font-medium"
            >
              ← Volver al Dashboard
            </button>
            <span>/</span>
            <span>Ciclo {ciclo?.anio || ''}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {clienteNombre} · {normaNombre}
          </h1>
        </div>

        {cicloId && (
          <button
            type="button"
            onClick={() => router.push(`/auditoria/${cicloId}/visor`)}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
          >
            Ver Visor A4 →
          </button>
        )}
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 mb-6">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-500">Cargando formulario dinámico...</div>
        ) : !ciclo ? (
          <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-slate-600">
            No se encontró el ciclo solicitado.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">
                    Documentos a generar ({docsSeleccionados.length} seleccionados)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Marca 1 o 2 documentos para probar de forma escalonada y ahorrar cuota de API.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDocsSeleccionados(['DOC-01'])}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    Solo DOC-01
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocsSeleccionados(['DOC-01', 'DOC-02'])}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    DOC-01 y DOC-02
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {OPCIONES_DOCUMENTOS.map((doc) => {
                  const checked = docsSeleccionados.includes(doc.codigo_doc);
                  return (
                    <label
                      key={doc.codigo_doc}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition ${
                        checked
                          ? 'bg-blue-50 border-blue-300 text-blue-900 font-medium'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDocumento(doc.codigo_doc)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{doc.titulo}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <DynamicFormEngine
              schema={esquemaNorma}
              initialData={ciclo.respuestas_json || {}}
              normaNombre={normaNombre}
              clienteNombre={clienteNombre}
              clienteSector={clienteSector}
              onSave={handleSaveDraft}
              onGenerateDocs={handleGenerateDocs}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default function FormularioAuditoriaPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500">Cargando ruta...</div>}>
      <FormularioAuditoriaContenido />
    </Suspense>
  );
}