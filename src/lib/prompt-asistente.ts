export interface ParametrosPromptCampo {
  normaNombre?: string;
  clienteNombre?: string;
  clienteSector?: string;
  seccionTitulo?: string;
  campoLabel?: string;
  aiPromptHint?: string;
  contextoActual?: Record<string, any>;
}

export function construirPromptCampo({
  normaNombre,
  clienteNombre,
  clienteSector,
  seccionTitulo,
  campoLabel,
  aiPromptHint,
  contextoActual,
}: ParametrosPromptCampo): string {
  const contextoLimpio =
    contextoActual && Object.keys(contextoActual).length > 0
      ? JSON.stringify(contextoActual).slice(0, 2200)
      : '';

  return [
    'Actúa como un consultor senior especialista en cumplimiento normativo y auditoría (ISO 27001, ENS, ISO 9001 y metodología MAGERIT).',
    `Cliente: ${clienteNombre || 'Empresa cliente'}${clienteSector ? ` (Sector: ${clienteSector})` : ''}.`,
    `Marco normativo: ${normaNombre || 'Normativa de cumplimiento'}.`,
    `Sección del formulario: ${seccionTitulo || 'General'}.`,
    `Campo a redactar: "${campoLabel || 'Campo de auditoría'}".`,
    aiPromptHint ? `Directriz específica del campo: ${aiPromptHint}.` : '',
    contextoLimpio ? `Respuestas y contexto ya cargados en el ciclo: ${contextoLimpio}.` : '',
    'Redacta una propuesta clara, profesional, precisa y lista para documentación de auditoría, en español, sin introducciones ni explicaciones meta.',
  ]
    .filter(Boolean)
    .join('\n');
}