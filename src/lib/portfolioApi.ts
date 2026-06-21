import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient'
import type { Polygon, PortfolioData, Rtu, Tenant, Utility } from '@/types/domain'

export function canPersistToSupabase(isAuthenticated: boolean): boolean {
  return isSupabaseConfigured && isAuthenticated
}

export async function updateBuildingPosition(
  buildingId: number,
  lat: number,
  lng: number,
): Promise<void> {
  const { error } = await supabase.from('buildings').update({ lat, lng }).eq('id', buildingId)
  if (error) throw error
}

export async function updateBuildingNotes(buildingId: number, notes: string): Promise<void> {
  const { error } = await supabase.from('buildings').update({ notes }).eq('id', buildingId)
  if (error) throw error
}

export async function updateRtuPosition(id: number, lat: number, lng: number): Promise<void> {
  const { error } = await supabase.from('rtus').update({ lat, lng }).eq('id', id)
  if (error) throw error
}

export async function updateTenantPosition(id: number, lat: number, lng: number): Promise<void> {
  const { error } = await supabase.from('tenants').update({ lat, lng }).eq('id', id)
  if (error) throw error
}

export async function updateUtilityPosition(id: number, lat: number, lng: number): Promise<void> {
  const { error } = await supabase.from('utilities').update({ lat, lng }).eq('id', id)
  if (error) throw error
}

export async function upsertPolygon(polygon: Polygon): Promise<Polygon> {
  const row = {
    name: polygon.name,
    description: polygon.description ?? '',
    color: polygon.color,
    paths: polygon.paths,
  }
  if (polygon.id) {
    const { data, error } = await supabase
      .from('polygons')
      .update(row)
      .eq('id', polygon.id)
      .select('*')
      .single()
    if (error) throw error
    return {
      id: data.id as number,
      name: data.name as string,
      description: (data.description as string | null) ?? '',
      color: data.color as string,
      paths: data.paths as Polygon['paths'],
    }
  }
  const { data, error } = await supabase.from('polygons').insert(row).select('*').single()
  if (error) throw error
  return {
    id: data.id as number,
    name: data.name as string,
    description: (data.description as string | null) ?? '',
    color: data.color as string,
    paths: data.paths as Polygon['paths'],
  }
}

export async function deletePolygon(id: number): Promise<void> {
  const { error } = await supabase.from('polygons').delete().eq('id', id)
  if (error) throw error
}

export async function importPortfolioToSupabase(data: PortfolioData): Promise<void> {
  for (const b of data.buildings) {
    let buildingId = b.id
    if (buildingId) {
      await supabase
        .from('buildings')
        .update({
          park: b.park,
          address: b.address,
          bu: b.bu,
          lat: b.lat,
          lng: b.lng,
          sqft: b.sqft,
          cluster: b.cluster,
          manager: b.manager,
          notes: b.notes,
        })
        .eq('id', buildingId)
    } else {
      const { data: inserted, error } = await supabase
        .from('buildings')
        .upsert(
          {
            park: b.park,
            address: b.address,
            bu: b.bu,
            lat: b.lat,
            lng: b.lng,
            sqft: b.sqft,
            cluster: b.cluster,
            manager: b.manager,
            notes: b.notes,
          },
          { onConflict: 'address' },
        )
        .select('id')
        .single()
      if (error) throw error
      buildingId = inserted.id as number
    }

    if (!buildingId) continue

    for (const rtu of b.rtus ?? []) {
      const row = rtuRow(buildingId, rtu)
      if (rtu.id) {
        await supabase.from('rtus').update(row).eq('id', rtu.id)
      } else {
        await supabase.from('rtus').insert(row)
      }
    }
    for (const tenant of b.tenants ?? []) {
      const row = tenantRow(buildingId, tenant)
      if (tenant.id) {
        await supabase.from('tenants').update(row).eq('id', tenant.id)
      } else {
        await supabase.from('tenants').insert(row)
      }
    }
  }

  for (const u of data.utilities) {
    const row = {
      utility_type: u.utility_type,
      name: u.name,
      description: u.description ?? '',
      lat: u.lat,
      lng: u.lng,
    }
    if (u.id) {
      await supabase.from('utilities').update(row).eq('id', u.id)
    } else {
      await supabase.from('utilities').insert(row)
    }
  }

  for (const p of data.polygons) {
    await upsertPolygon(p)
  }
}

function rtuRow(buildingId: number, rtu: Rtu) {
  return {
    building_id: buildingId,
    name: rtu.name,
    description: rtu.description ?? '',
    lat: rtu.lat,
    lng: rtu.lng,
    model: rtu.model,
    serial: rtu.serial,
    make: rtu.make,
    install_date: rtu.install_date,
    install_year: rtu.install_year,
    heating_btu: rtu.heating_btu,
    cooling_tons: rtu.cooling_tons,
    suite: rtu.suite,
  }
}

function tenantRow(buildingId: number, tenant: Tenant) {
  return {
    building_id: buildingId,
    name: tenant.name,
    description: tenant.description ?? '',
    lat: tenant.lat,
    lng: tenant.lng,
  }
}

export async function addUtilityMarker(
  utility: Omit<Utility, 'id'>,
): Promise<Utility> {
  const { data, error } = await supabase
    .from('utilities')
    .insert({
      utility_type: utility.utility_type,
      name: utility.name,
      description: utility.description ?? '',
      lat: utility.lat,
      lng: utility.lng,
    })
    .select('*')
    .single()
  if (error) throw error
  return {
    id: data.id as number,
    utility_type: data.utility_type as Utility['utility_type'],
    name: data.name as string,
    description: (data.description as string | null) ?? '',
    lat: data.lat as number,
    lng: data.lng as number,
  }
}
