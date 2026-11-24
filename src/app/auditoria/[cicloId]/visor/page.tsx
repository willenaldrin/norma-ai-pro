'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface DocumentoItem {
  id?: string;
  doc_codigo?: string;
  codigo_doc?: string;
  titulo: string;
  contenido_html?: string;
  contenido?: string;
  contenido_markdown?: string;
}

function VisorContenido() {
  const params = useParams<{ cicloId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const cicloId = params?.cicloId;

  const [documentos, setDocumentos] = useState<DocumentoItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [tituloEncabezado, setTituloEncabezado] = useState('Documentación de Auditoría');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const cargarDocumentos = async () => {
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

        const { data: ciclo, error: cicloError } = await supabase
          .from('ciclos_auditoria')
          .select('*, clientes(*), normas_plantillas(*)')
          .eq('id', cicloId)
          .single();

        if (cicloError) throw cicloError;

        const clienteNombre = ciclo?.clientes?.nombre_empresa || 'Cliente';
        const normaNombre =
          ciclo?.normas_plantillas?.nombre_visible ||
          ciclo?.normas_plantillas?.codigo_norma ||
          'Normativa';
        setTituloEncabezado(`${clienteNombre} · ${normaNombre} (${ciclo?.anio || ''})`);

        const { data: docsTabla, error: docsError } = await supabase
          .from('documentos_generados')
          .select('*')
          .eq('ciclo_id', cicloId);

        if (!docsError && Array.isArray(docsTabla) && docsTabla.length > 0) {
          setDocumentos(docsTabla);
        } else if (Array.isArray(ciclo?.documentos_generados)) {
          setDocumentos(ciclo.documentos_generados);
        } else {
          setDocumentos([]);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'No se pudieron cargar los documentos generados.');
      } finally {
        setLoading(false);
      }
    };

    cargarDocumentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloId]);

  const docActual = documentos[selectedIdx];
  const textoDocumento =
    docActual?.contenido_html ||
    docActual?.contenido_markdown ||
    docActual?.contenido ||
    '';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="text-blue-600 hover:underline font-medium"
            >
              ← Dashboard
            </button>
            <span>/</span>
            {cicloId && (
              <button
                type="button"
                onClick={() => router.push(`/auditoria/${cicloId}/formulario`)}
                className="text-blue-600 hover:underline font-medium"
              >
                Volver al Formulario
              </button>
            )}
          </div>
          <h1 className="text-lg font-bold text-slate-900">{tituloEncabezado}</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition"
          >
            🖨️ Imprimir / Guardar PDF
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 mb-6">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-500">Cargando visor documental...</div>
        ) : documentos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
            <p className="text-slate-600">
              Aún no hay documentos generados para este ciclo. Vuelve al formulario y pulsa{' '}
              <strong>&ldquo;Generar Documentos con IA&rdquo;</strong>.
            </p>
            {cicloId && (
              <button
                type="button"
                onClick={() => router.push(`/auditoria/${cicloId}/formulario`)}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              >
                Ir al Formulario
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <aside className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-4 h-fit space-y-2 print:hidden">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-2 pb-2 border-b border-slate-100">
                Documentos ({documentos.length})
              </h2>
              {documentos.map((doc, idx) => {
                const codigo = doc.doc_codigo || doc.codigo_doc;
                return (
                  <button
                    key={doc.id || `${doc.titulo}-${idx}`}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                      idx === selectedIdx
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {codigo ? `${codigo} · ` : ''}
                    {doc.titulo}
                  </button>
                );
              })}
            </aside>

            <section className="lg:col-span-3 flex justify-center">
              <article className="w-full max-w-[210mm] min-h-[297mm] bg-white border border-slate-200 shadow-sm rounded-xl p-8 md:p-12 print:shadow-none print:border-none print:p-0">
                <div className="border-b border-slate-200 pb-4 mb-6">
                  <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                    {tituloEncabezado}
                  </p>
                  <h2 className="text-2xl font-bold text-slate-900 mt-1">
                    {docActual?.titulo}
                  </h2>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {textoDocumento}
                </div>
              </article>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default function VisorAuditoriaPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500">Cargando visor...</div>}>
      <VisorContenido />
    </Suspense>
  );
}