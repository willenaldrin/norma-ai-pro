import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MODELOS_CANDIDATOS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash'];

const DOCUMENTOS_BASE = [
  {
    codigo_doc: 'DOC-01',
    clave: '01_Alcance_y_Contexto_SGSI',
    titulo_base: 'Alcance y Contexto del Sistema de Gestión',
  },
  {
    codigo_doc: 'DOC-02',
    clave: '02_Politica_de_Seguridad_y_Cumplimiento',
    titulo_base: 'Política de Seguridad y Cumplimiento',
  },
  {
    codigo_doc: 'DOC-03',
    clave: '03_Inventario_de_Activos_y_Valoracion_MAGERIT',
    titulo_base: 'Inventario de Activos y Valoración MAGERIT',
  },
  {
    codigo_doc: 'DOC-04',
    clave: '04_Analisis_y_Tratamiento_de_Riesgos',
    titulo_base: 'Análisis y Tratamiento de Riesgos',
  },
  {
    codigo_doc: 'DOC-05',
    clave: '05_Declaracion_de_Aplicabilidad_SoA',
    titulo_base: 'Declaración de Aplicabilidad (SoA)',
  },
];

function construirBorradorRespaldo(params: {
  codigoDoc: string;
  tituloFormal: string;
  clienteNombre: string;
  clienteSector: string;
  normaNombre: string;
  anio: number | string;
  datosFinales: Record<string, any>;
  motivo: string;
}) {
  const {
    codigoDoc,
    tituloFormal,
    clienteNombre,
    clienteSector,
    normaNombre,
    anio,
    datosFinales,
    motivo,
  } = params;

  const entradas = Object.entries(datosFinales || {}).filter(
    ([, v]) => v !== undefined && v !== null && String(v).trim() !== ''
  );

  const resumenDatos =
    entradas.length > 0
      ? entradas
          .slice(0, 12)
          .map(([k, v]) => `- **${k}:** ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
          .join('\n')
      : '- *Sin respuestas cargadas aún en el formulario del ciclo.*';

  return [
    `# ${tituloFormal}`,
    '',
    `**Organización:** ${clienteNombre} · **Sector:** ${clienteSector}`,
    `**Marco normativo:** ${normaNombre} · **Ciclo/Año:** ${anio} · **Código:** ${codigoDoc}`,
    '',
    `> **Nota de contingencia:** Se ha generado este borrador estructurado base porque la API externa no respondió a tiempo o alcanzó su límite temporal (${motivo}). Puedes revisarlo aquí y regenerar con IA cuando haya disponibilidad.`,
    '',
    '## 1. Propósito y alineación normativa',
    `Documento preliminar de trabajo alineado con **${normaNombre}** para **${clienteNombre}**, listo para revisión y ampliación por parte de la consultoría.`,
    '',
    '## 2. Datos capturados en el ciclo de auditoría',
    resumenDatos,
    '',
    '## 3. Siguientes pasos de auditoría',
    '- Validar el alcance, activos críticos y controles aplicables con el responsable del cliente.',
    '- Completar evidencias y aprobar la versión final del documento.',
  ].join('\n');
}

async function llamarGeminiRapido(apiKey: string, payload: Record<string, unknown>) {
  let ultimoError = 'Sin respuesta oportuna de Gemini.';
  let ultimoStatus = 503;

  for (const modelo of MODELOS_CANDIDATOS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });

      const data = await res.json();

      if (res.ok) {
        return { ok: true as const, data, modeloUsado: modelo };
      }

      ultimoStatus = res.status;
      ultimoError = data?.error?.message || `HTTP ${res.status} en ${modelo}`;
    } catch (err: any) {
      ultimoStatus = 503;
      ultimoError =
        err?.name === 'TimeoutError'
          ? `Timeout (12s) en ${modelo}`
          : err?.message || `Error de red en ${modelo}`;
    }
  }

  return { ok: false as const, error: ultimoError, status: ultimoStatus };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    const body = await req.json();
    const { cicloId, datosFormulario, documentosSeleccionados } = body;

    if (!cicloId) {
      return NextResponse.json({ error: 'Falta cicloId en la petición.' }, { status: 400 });
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const { data: ciclo, error: cicloError } = await supabase
      .from('ciclos_auditoria')
      .select('*, clientes(*), normas_plantillas(*)')
      .eq('id', cicloId)
      .single();

    if (cicloError || !ciclo) {
      return NextResponse.json(
        { error: cicloError?.message || 'No se encontró el ciclo de auditoría.' },
        { status: 404 }
      );
    }

    const cliente = ciclo.clientes as Record<string, any> | null;
    const norma = ciclo.normas_plantillas as Record<string, any> | null;
    const datosFinales = datosFormulario ?? ciclo.respuestas_json ?? {};

    const clienteNombre = cliente?.nombre_empresa || 'Cliente';
    const clienteSector = cliente?.sector || 'No especificado';
    const normaNombre = norma?.nombre_visible || norma?.codigo_norma || 'Normativa';
    const anio = ciclo.anio || new Date().getFullYear();

    const docsAProcesar =
      Array.isArray(documentosSeleccionados) && documentosSeleccionados.length > 0
        ? DOCUMENTOS_BASE.filter((d) => documentosSeleccionados.includes(d.codigo_doc))
        : DOCUMENTOS_BASE;

    const listaDocsFinal = docsAProcesar.length > 0 ? docsAProcesar : DOCUMENTOS_BASE;

    const listaDocs: Array<{
      doc_codigo: string;
      codigo_doc: string;
      titulo: string;
      contenido_html: string;
      contenido_markdown: string;
      modeloUsado?: string;
    }> = [];

    let ultimoModeloUsado = 'contingencia-estructurada';

    for (const docSpec of listaDocsFinal) {
      const tituloFormal = `${docSpec.titulo_base} — ${clienteNombre}`;
      let contenidoMarkdown = '';
      let modeloUsadoDoc = 'contingencia-estructurada';

      if (apiKey) {
        const promptDoc = [
          'Actúa como consultor de cumplimiento normativo (ISO 27001, ENS, ISO 9001, MAGERIT).',
          `Redacta de forma concisa y estructurada (máx. 500 palabras) el documento "${docSpec.titulo_base}" para "${clienteNombre}" (Sector: ${clienteSector}), norma "${normaNombre}", ciclo ${anio}.`,
          `Datos del formulario: ${JSON.stringify(datosFinales).slice(0, 1800)}`,
          'Responde en Markdown limpio en español, sin introducciones.',
        ].join('\n');

        const resDoc = await llamarGeminiRapido(apiKey, {
          contents: [
            {
              role: 'user',
              parts: [{ text: promptDoc }],
            },
          ],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1200,
          },
        });

        if (resDoc.ok) {
          const texto =
            resDoc.data?.candidates?.[0]?.content?.parts
              ?.map((p: { text?: string }) => p.text || '')
              .join('')
              .trim() || '';

          if (texto) {
            contenidoMarkdown = texto;
            modeloUsadoDoc = resDoc.modeloUsado;
            ultimoModeloUsado = resDoc.modeloUsado;
          } else {
            contenidoMarkdown = construirBorradorRespaldo({
              codigoDoc: docSpec.codigo_doc,
              tituloFormal,
              clienteNombre,
              clienteSector,
              normaNombre,
              anio,
              datosFinales,
              motivo: 'respuesta vacía del modelo',
            });
          }
        } else {
          contenidoMarkdown = construirBorradorRespaldo({
            codigoDoc: docSpec.codigo_doc,
            tituloFormal,
            clienteNombre,
            clienteSector,
            normaNombre,
            anio,
            datosFinales,
            motivo: resDoc.error,
          });
        }
      } else {
        contenidoMarkdown = construirBorradorRespaldo({
          codigoDoc: docSpec.codigo_doc,
          tituloFormal,
          clienteNombre,
          clienteSector,
          normaNombre,
          anio,
          datosFinales,
          motivo: 'GEMINI_API_KEY no configurada',
        });
      }

      listaDocs.push({
        doc_codigo: docSpec.codigo_doc,
        codigo_doc: docSpec.codigo_doc,
        titulo: tituloFormal,
        contenido_html: contenidoMarkdown,
        contenido_markdown: contenidoMarkdown,
        modeloUsado: modeloUsadoDoc,
      });
    }

    const filasInsertar = listaDocs.map((doc) => ({
      ciclo_id: cicloId,
      doc_codigo: doc.doc_codigo,
      titulo: doc.titulo,
      contenido_html: doc.contenido_html,
      version_doc: 1,
    }));

    const { data: insertedRows, error: insertDocsError } = await supabase
      .from('documentos_generados')
      .insert(filasInsertar)
      .select();

    let guardadoEn = 'documentos_generados';
    let errorPersistencia: string | null = null;

    if (insertDocsError) {
      errorPersistencia = insertDocsError.message;
      guardadoEn = 'ciclos_auditoria.documentos_generados';

      const { error: updateCicloError } = await supabase
        .from('ciclos_auditoria')
        .update({
          estado: 'generado',
          respuestas_json: datosFinales,
          documentos_generados: listaDocs,
        })
        .eq('id', cicloId);

      if (updateCicloError) {
        errorPersistencia = `${errorPersistencia} | update ciclo: ${updateCicloError.message}`;
      }
    } else {
      await supabase
        .from('ciclos_auditoria')
        .update({
          estado: 'generado',
          respuestas_json: datosFinales,
        })
        .eq('id', cicloId);
    }

    return NextResponse.json({
      ok: true,
      modeloUsado: ultimoModeloUsado,
      totalDocumentos: listaDocs.length,
      guardadoEn,
      insertadosCount: insertedRows?.length ?? 0,
      errorPersistencia,
      documentos: listaDocs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error interno en /api/generar-docs.' },
      { status: 500 }
    );
  }
}