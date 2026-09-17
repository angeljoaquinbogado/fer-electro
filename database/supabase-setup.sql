-- ============================================================
-- FER⚡ELECTRO - CONFIGURACIÓN SEGURA DE SUPABASE
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Antes: crear el usuario administrador en Authentication > Users.
-- Después: reemplazar ADMIN_EMAIL_AQUI por su email y ejecutar
-- solamente el bloque final de "DAR PERMISO DE ADMIN".
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Tabla de administradores
create table if not exists public.admin_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Admin can read own admin row" on public.admin_users;
create policy "Admin can read own admin row"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

-- Función segura reutilizable por las políticas
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists(
        select 1
        from public.admin_users
        where user_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2) Productos: completar columnas si faltan
alter table public.productos
    add column if not exists descripcion text,
    add column if not exists precio numeric(12,2) not null default 0,
    add column if not exists imagen text,
    add column if not exists categoria text,
    add column if not exists stock integer not null default 0,
    add column if not exists activo boolean not null default true,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'productos_precio_no_negativo'
          and conrelid = 'public.productos'::regclass
    ) then
        alter table public.productos
            add constraint productos_precio_no_negativo check (precio >= 0) not valid;
        alter table public.productos validate constraint productos_precio_no_negativo;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'productos_stock_no_negativo'
          and conrelid = 'public.productos'::regclass
    ) then
        alter table public.productos
            add constraint productos_stock_no_negativo check (stock >= 0) not valid;
        alter table public.productos validate constraint productos_stock_no_negativo;
    end if;
end $$;

alter table public.productos enable row level security;

drop policy if exists "Public can view active products" on public.productos;
create policy "Public can view active products"
on public.productos
for select
to anon, authenticated
using (activo = true or public.is_admin());

drop policy if exists "Admins can insert products" on public.productos;
create policy "Admins can insert products"
on public.productos
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update products" on public.productos;
create policy "Admins can update products"
on public.productos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete products" on public.productos;
create policy "Admins can delete products"
on public.productos
for delete
to authenticated
using (public.is_admin());

-- 3) Pedidos
create table if not exists public.pedidos (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    cliente_nombre text not null,
    cliente_email text not null,
    cliente_telefono text not null,
    domicilio text not null,
    ciudad text not null,
    provincia text not null,
    codigo_postal text not null,
    metodo_entrega text not null default 'envio',
    notas text,
    total numeric(12,2) not null check (total >= 0),
    estado text not null default 'pendiente',
    preparacion_estado text not null default 'nuevo',
    mp_preference_id text,
    mp_payment_id text
);

alter table public.pedidos
    add column if not exists preparacion_estado text not null default 'nuevo';

create index if not exists pedidos_created_at_idx
on public.pedidos(created_at desc);

create index if not exists pedidos_estado_idx
on public.pedidos(estado);

alter table public.pedidos enable row level security;

drop policy if exists "Admins can view orders" on public.pedidos;
create policy "Admins can view orders"
on public.pedidos
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update orders" on public.pedidos;
create policy "Admins can update orders"
on public.pedidos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- No se habilita INSERT/DELETE al navegador.
-- Los pedidos se crean y actualizan solo desde las funciones de Vercel
-- usando SUPABASE_SERVICE_ROLE_KEY.

-- 4) Ítems de pedido
create table if not exists public.pedido_items (
    id bigint generated by default as identity primary key,
    pedido_id uuid not null references public.pedidos(id) on delete cascade,
    producto_id bigint references public.productos(id) on delete set null,
    nombre text not null,
    cantidad integer not null check (cantidad > 0),
    precio_unitario numeric(12,2) not null check (precio_unitario >= 0)
);

create index if not exists pedido_items_pedido_id_idx
on public.pedido_items(pedido_id);

alter table public.pedido_items enable row level security;

drop policy if exists "Admins can view order items" on public.pedido_items;
create policy "Admins can view order items"
on public.pedido_items
for select
to authenticated
using (public.is_admin());

-- 5) Confirmación atómica del pago y descuento de stock.
-- El webhook llama esta función solamente después de verificar el pago
-- consultando directamente a Mercado Pago con el token privado.
create or replace function public.confirmar_pago_pedido(
    p_pedido_id uuid,
    p_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
    v_falta_stock boolean;
begin
    select estado
    into v_estado
    from public.pedidos
    where id = p_pedido_id
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'pedido_no_encontrado');
    end if;

    if v_estado = 'pagado' then
        return jsonb_build_object('ok', true, 'already_paid', true);
    end if;

    select exists(
        select 1
        from public.pedido_items i
        left join public.productos p on p.id = i.producto_id
        where i.pedido_id = p_pedido_id
          and (p.id is null or p.stock < i.cantidad)
    )
    into v_falta_stock;

    if v_falta_stock then
        update public.pedidos
        set estado = 'pagado_revisar_stock',
            mp_payment_id = p_payment_id
        where id = p_pedido_id;

        return jsonb_build_object('ok', false, 'reason', 'stock_insuficiente');
    end if;

    update public.productos p
    set stock = p.stock - i.cantidad,
        updated_at = now()
    from public.pedido_items i
    where i.pedido_id = p_pedido_id
      and i.producto_id = p.id;

    update public.pedidos
    set estado = 'pagado',
        mp_payment_id = p_payment_id
    where id = p_pedido_id;

    return jsonb_build_object('ok', true, 'paid', true);
end;
$$;

revoke all on function public.confirmar_pago_pedido(uuid,text) from public;
revoke all on function public.confirmar_pago_pedido(uuid,text) from anon;
revoke all on function public.confirmar_pago_pedido(uuid,text) from authenticated;
grant execute on function public.confirmar_pago_pedido(uuid,text) to service_role;

-- 6) Storage para imágenes de productos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'productos',
    'productos',
    true,
    5242880,
    array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects
for select
to public
using (bucket_id = 'productos');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'productos'
    and public.is_admin()
);

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'productos'
    and public.is_admin()
)
with check (
    bucket_id = 'productos'
    and public.is_admin()
);

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'productos'
    and public.is_admin()
);

-- ============================================================
-- DAR PERMISO DE ADMIN
-- 1. Crear primero el usuario en Supabase > Authentication > Users.
-- 2. Cambiar el email de abajo.
-- 3. Ejecutar SOLO este bloque.
-- ============================================================

-- insert into public.admin_users (user_id)
-- select id
-- from auth.users
-- where lower(email) = lower('ADMIN_EMAIL_AQUI')
-- on conflict (user_id) do nothing;
