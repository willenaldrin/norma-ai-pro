'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Cliente {
  id: string;
  nombre_empresa: string;
  sector?: string;
  cif?: string;
}

interface NormaPlantilla {
  id: string;
  codigo_norma?: string;
  nombre_visible?: string;
  version_esquema?: string;
  activa?: boolean;
}

interface CicloAuditoria {
  id: string;
  cliente_id: string;
  norma_id: string;
  anio: number;
  estado?: string;
  clientes?: { nombre_empresa: string };
  normas_plantillas?: NormaPlantilla & {
    codigo?: string;
    nombre?: string;
    titulo?: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string>('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [normas, setNormas] = useState<NormaPlantilla[]>([]);
  const [ciclos, setCiclos] = useState<CicloAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Estado para crear un nuevo cliente rápido
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('');
  const [nuevoClienteSector, setNuevoClienteSector] = useState('');
  const [nuevoClienteCif, setNuevoClienteCif] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);

  // Estado para iniciar/abrir un ciclo de auditoría
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedNormaId, setSelectedNormaId] = useState('');
  const [selectedAnio, setSelectedAnio] = useState<number>(2026);
  const [iniciandoCiclo, setIniciandoCiclo] = useState(false);

  const cargarDatos = async () => {
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
      setUserEmail(user.email || '');

      const [clientesRes, normasRes, ciclosRes] = await Promise.all([
        supabase
          .from('clientes')
          .select('id, nombre_empresa, sector, cif')
          .order('nombre_empresa'),
        supabase.from('normas_plantillas').select('*'),
        supabase
          .from('ciclos_auditoria')
          .select('*, clientes(nombre_empresa), normas_plantillas(*)')
          .order('anio', { ascending: false }),
      ]);

      if (clientesRes.error) throw clientesRes.error;
      if (normasRes.error) throw normasRes.error;
      if (ciclosRes.error) throw ciclosRes.error;

      const listaClientes = clientesRes.data || [];
      const listaNormas = normasRes.data || [];

      setClientes(listaClientes);
      setNormas(listaNormas);
      setCiclos((ciclosRes.data as unknown as CicloAuditoria[]) || []);

      if (listaClientes.length > 0 && !selectedClienteId) {
        setSelectedClienteId(listaClientes[0].id);
      }
      if (listaNormas.length > 0 && !selectedNormaId) {
        setSelectedNormaId(listaNormas[0].id);
      }
    } catch (err: any) {
      setErrorMsg(
        err.message ||
          'No se pudieron cargar los datos de Supabase. Revisa las tablas y permisos RLS.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedAnio(new Date().getFullYear());
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCrearCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoClienteNombre.trim()) return;
    setCreandoCliente(true);
    setErrorMsg('');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('clientes')
        .insert([
          {
            nombre_empresa: nuevoClienteNombre.trim(),
            sector: nuevoClienteSector.trim() || null,
            cif: nuevoClienteCif.trim() || null,
            consultor_id: user?.id,
          },
        ])
        .select('id, nombre_empresa, sector, cif')
        .single();

      if (error) throw error;

      setClientes((prev) => [...prev, data]);
      setSelectedClienteId(data.id);
      setNuevoClienteNombre('');
      setNuevoClienteSector('');
      setNuevoClienteCif('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al crear el cliente.');
    } finally {
      setCreandoCliente(false);
    }
  };

  const handleAbrirCiclo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClienteId || !selectedNormaId) return;
    setIniciandoCiclo(true);
    setErrorMsg('');

    try {
      const { data: existente, error: checkError } = await supabase
        .from('ciclos_auditoria')
        .select('id')
        .eq('cliente_id', selectedClienteId)
        .eq('norma_id', selectedNormaId)
        .eq('anio', selectedAnio)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existente?.id) {
        router.push(`/auditoria/${existente.id}/formulario`);
        return;
      }

      const { data: nuevoCiclo, error: insertError } = await supabase
        .from('ciclos_auditoria')
        .insert([
          {
            cliente_id: selectedClienteId,
            norma_id: selectedNormaId,
            anio: selectedAnio,
            estado: 'borrador',
            respuestas_json: {},
          },
        ])
        .select('id')
        .single();

      if (insertError) throw insertError;

      router.push(`/auditoria/${nuevoCiclo.id}/formulario`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al abrir o crear el ciclo de auditoría.');
      setIniciandoCiclo(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const getNormaLabel = (
    n?: Partial<NormaPlantilla> & {
      codigo?: string;
      nombre?: string;
      titulo?: string;
    }
  ) => {
    if (!n) return 'Norma';
    const base = n.nombre_visible || n.nombre || n.titulo || 'Plantilla';
    const codigo = n.codigo_norma || n.codigo;
    return codigo ? `${codigo} — ${base}` : base;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">NormaAI Pro · Panel de Consultoría</h1>
          <p className="text-xs text-slate-500">Sesión iniciada como {userEmail || 'Consultor'}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
        >
          Cerrar sesión
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-8">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-500">Cargando panel de auditorías...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <h2 className="text-lg font-bold text-slate-900 mb-1">1. Nuevo Cliente</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Registra una empresa cliente para asociar sus ciclos de cumplimiento.
                </p>

                <form onSubmit={handleCrearCliente} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Nombre o Razón Social *
                    </label>
                    <input
                      type="text"
                      required
                      value={nuevoClienteNombre}
                      onChange={(e) => setNuevoClienteNombre(e.target.value)}
                      placeholder="Ej. Logística Mediterráneo S.L."
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        CIF / NIF
                      </label>
                      <input
                        type="text"
                        value={nuevoClienteCif}
                        onChange={(e) => setNuevoClienteCif(e.target.value)}
                        placeholder="Ej. B12345678"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Sector de actividad
                      </label>
                      <input
                        type="text"
                        value={nuevoClienteSector}
                        onChange={(e) => setNuevoClienteSector(e.target.value)}
                        placeholder="Ej. Transporte, SaaS..."
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={creandoCliente}
                    className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {creandoCliente ? 'Guardando...' : '+ Añadir Cliente'}
                  </button>
                </form>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <h2 className="text-lg font-bold text-slate-900 mb-1">
                  2. Abrir o Iniciar Ciclo de Auditoría
                </h2>
                <p className="text-sm text-slate-500 mb-4">
                  Elige cliente, marco normativo y año para trabajar en el formulario dinámico.
                </p>

                <form onSubmit={handleAbrirCiclo} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Cliente</label>
                    <select
                      value={selectedClienteId}
                      onChange={(e) => setSelectedClienteId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm bg-white outline-none focus:border-blue-500"
                    >
                      {clientes.length === 0 && <option value="">Crea primero un cliente</option>}
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre_empresa} {c.sector ? `(${c.sector})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Norma / Marco
                      </label>
                      <select
                        value={selectedNormaId}
                        onChange={(e) => setSelectedNormaId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm bg-white outline-none focus:border-blue-500"
                      >
                        {normas.length === 0 && (
                          <option value="">Sin normas cargadas en BD</option>
                        )}
                        {normas.map((n) => (
                          <option key={n.id} value={n.id}>
                            {getNormaLabel(n)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Año</label>
                      <input
                        type="number"
                        min={2020}
                        max={2035}
                        value={selectedAnio}
                        onChange={(e) => setSelectedAnio(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={iniciandoCiclo || !selectedClienteId || !selectedNormaId}
                    className="w-full px-5 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {iniciandoCiclo ? 'Abriendo ciclo...' : 'Continuar al Formulario →'}
                  </button>
                </form>
              </section>
            </div>

            <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Ciclos de Auditoría Recientes</h2>
              {ciclos.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aún no hay ciclos creados. Selecciona un cliente, una norma y un año arriba para
                  comenzar.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-slate-500 uppercase">
                        <th className="py-2.5 pr-4">Cliente</th>
                        <th className="py-2.5 px-4">Norma</th>
                        <th className="py-2.5 px-4">Año</th>
                        <th className="py-2.5 px-4">Estado</th>
                        <th className="py-2.5 pl-4 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ciclos.map((ciclo) => (
                        <tr key={ciclo.id}>
                          <td className="py-3 pr-4 font-medium text-slate-900">
                            {ciclo.clientes?.nombre_empresa || 'Cliente'}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {getNormaLabel(ciclo.normas_plantillas)}
                          </td>
                          <td className="py-3 px-4 text-slate-700">{ciclo.anio}</td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
                              {ciclo.estado || 'borrador'}
                            </span>
                          </td>
                          <td className="py-3 pl-4 text-right">
                            <button
                              type="button"
                              onClick={() => router.push(`/auditoria/${ciclo.id}/formulario`)}
                              className="text-blue-600 hover:text-blue-800 font-semibold text-xs"
                            >
                              Abrir formulario →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}