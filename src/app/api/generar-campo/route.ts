import { NextRequest, NextResponse } from 'next/server';

const MODELOS_CANDIDATOS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash'];

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function esErrorTemporal(status: number, mensaje: string) {
  const texto = mensaje.toLowerCase();
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    texto.includes('high demand') ||
    texto.includes('overloaded') ||
    texto.includes('temporarily') ||
    texto.includes('timeout')
  );
}

function construirPropuestaRespaldo(params: {
  normaNombre?: string;
  clienteNombre?: string;
  clienteSector?: string;
  seccionTitulo?: string;
  campoLabel?: string;
  aiPromptHint?: string;
  motivo: string;
}) {
  const empresa = params.clienteNombre || 'la organización';
  const sector = params.clienteSector ? ` (sector ${params.clienteSector})` : '';
  const norma = params.normaNombre || 'la normativa aplicable';
  const campo = params.campoLabel || 'este apartado';
  const seccion = params.seccionTitulo ? ` dentro de ${params.seccionTitulo}` : '';

  return [
    `Propuesta inicial para "${campo}"${seccion} de ${empresa}${sector}, alineada con ${norma}:`,
    '',
    `- Definir el alcance, responsabilidades y límites aplicables a los procesos y sistemas clave de ${empresa}.`,
    `- Alinear los criterios de control, evidencias y revisión periódica con los requisitos de ${norma}.`,
    params.aiPromptHint ? `- Considerar específicamente: ${params.aiPromptHint}.` : '',
    '',
    `[Borrador generado en modo contingencia por: ${params.motivo}. Puedes editarlo libremente o reintentar con IA.]`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function llamarGeminiConReintentos(apiKey: string, payload: Record<string, unknown>) {
  let ultimoError = 'Error al consultar la API de Gemini.';
  let ultimoStatus = 503;

  for (const modelo of MODELOS_CANDIDATOS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;

    // Hasta 2 intentos rápidos (10s) por modelo para evitar esperas largas en UI
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          return { ok: true as const, data, modeloUsado: modelo };
        }

        ultimoStatus = res.status;
        ultimoError = data?.error?.message || `Error HTTP ${res.status} con el modelo ${modelo}.`;

        if (!esErrorTemporal(res.status, ultimoError)) {
          break;
        }

        if (intento < 2) {
          await esperar(500);
        }
      } catch (err: any) {
        ultimoStatus = 503;
        ultimoError =
          err?.name === 'TimeoutError'
            ? `Timeout (10s) en ${modelo}`
            : err?.message || `Error de red en ${modelo}`;

        if (intento < 2) {
          await esperar(500);
        }
      }
    }
  }

  return { ok: false as const, error: ultimoError, status: ultimoStatus };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      normaNombre,
      clienteNombre,
      clienteSector,
      seccionTitulo,
      campoLabel,
      aiPromptHint,
      contextoActual,
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        suggestion: construirPropuestaRespaldo({
          normaNombre,
          clienteNombre,
          clienteSector,
          seccionTitulo,
          campoLabel,
          aiPromptHint,
          motivo: 'GEMINI_API_KEY no configurada',
        }),
        modeloUsado: 'contingencia-estructurada',
      });
    }

    const prompt = [
      'Actúa como un consultor senior especialista en cumplimiento normativo y auditoría (ISO 27001, ENS, ISO 9001 y metodología MAGERIT).',
      `Cliente: ${clienteNombre || 'Empresa cliente'}${clienteSector ? ` (Sector: ${clienteSector})` : ''}.`,
      `Marco normativo: ${normaNombre || 'Normativa de cumplimiento'}.`,
      `Sección actual: ${seccionTitulo || 'General'}.`,
      `Campo a redactar: "${campoLabel}".`,
      aiPromptHint ? `Instrucción adicional del campo: ${aiPromptHint}.` : '',
      contextoActual
        ? `Contexto ya rellenado en el formulario (JSON): ${JSON.stringify(contextoActual).slice(0, 2500)}.`
        : '',
      'Redacta una propuesta clara, profesional, precisa y lista para usar en documentación de auditoría, en español, sin introducciones ni explicaciones meta.',
    ]
      .filter(Boolean)
      .join('\n');

    const resultado = await llamarGeminiConReintentos(apiKey, {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
      },
    });

    if (!resultado.ok) {
      return NextResponse.json({
        suggestion: construirPropuestaRespaldo({
          normaNombre,
          clienteNombre,
          clienteSector,
          seccionTitulo,
          campoLabel,
          aiPromptHint,
          motivo: resultado.error,
        }),
        modeloUsado: 'contingencia-estructurada',
        aviso: resultado.error,
      });
    }

    const suggestion =
      resultado.data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || '')
        .join('')
        .trim() || '';

    if (!suggestion) {
      return NextResponse.json({
        suggestion: construirPropuestaRespaldo({
          normaNombre,
          clienteNombre,
          clienteSector,
          seccionTitulo,
          campoLabel,
          aiPromptHint,
          motivo: 'respuesta vacía del modelo',
        }),
        modeloUsado: 'contingencia-estructurada',
      });
    }

    return NextResponse.json({
      suggestion,
      modeloUsado: resultado.modeloUsado,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error interno en /api/generar-campo.' },
      { status: 500 }
    );
  }
}