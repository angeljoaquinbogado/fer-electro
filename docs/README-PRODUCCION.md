# FER⚡ELECTRO — versión de producción

Este paquete deja preparada la tienda con catálogo dinámico, carrito, selector de cantidades,
checkout, Mercado Pago, pedidos, descuento de stock y un panel privado para administrar productos.

## Archivos

- `index.html` — tienda pública.
- `admin.html` — panel privado (`/admin.html`).
- `api/products.js` — catálogo público desde Supabase.
- `api/checkout.js` — valida precios/stock en servidor y crea el pago.
- `api/mercadopago-webhook.js` — verifica pagos consultando Mercado Pago y confirma pedidos.
- `api/order-status.js` — estado mínimo del pedido para la pantalla de retorno.
- `api/public-config.js` — solo expone configuración pública necesaria para el login del panel.
- `supabase-setup.sql` — tablas, RLS, políticas, Storage y función de confirmación de pago.
- `vercel.json` — headers de seguridad.
- `.env.example` — nombres de variables necesarias, sin secretos.

## 1. Subir los archivos al mismo repositorio `fer-electro`

Mantener también las imágenes actuales (`logo.PNG`, `logo-2.PNG`, etc.).
La carpeta `api` debe conservar ese nombre exacto en minúsculas.

## 2. Preparar Supabase

En Supabase > SQL Editor, ejecutar `supabase-setup.sql`.

Después ir a Authentication > Users y crear la cuenta del administrador con email y contraseña.
Con el usuario creado, ejecutar SOLO este bloque en SQL Editor reemplazando el email:

```sql
insert into public.admin_users (user_id)
select id
from auth.users
where lower(email) = lower('EMAIL_DEL_ADMIN')
on conflict (user_id) do nothing;
```

El panel queda en:

`https://fer-electro.vercel.app/admin.html`

La cuenta autenticada pero NO incluida en `admin_users` no puede editar productos ni ver pedidos.

## 3. Variables de entorno en Vercel

En Vercel > proyecto `fer-electro` > Settings > Environment Variables, deben existir:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MERCADOPAGO_ACCESS_TOKEN`

Las dos primeras ya se usaban en el proyecto. Las dos últimas son privadas y deben configurarse
solo en Vercel. No pegarlas en HTML, GitHub ni chats.

Después de agregar/cambiar variables, hacer un Redeploy de Production.

## 4. Mercado Pago

Usar el Access Token del comercio que va a cobrar.
El backend crea la preferencia y define automáticamente el webhook:

`https://fer-electro.vercel.app/api/mercadopago-webhook`

El webhook NO confía en el contenido recibido: consulta el pago directamente a Mercado Pago
con el token privado, compara el importe con el pedido y recién entonces confirma el pedido.

Antes de aceptar ventas reales, hacer una compra de prueba con las credenciales de prueba
de la cuenta de Mercado Pago. Después cambiar a credenciales de producción.

## 5. Envíos

La tienda permite compras desde cualquier provincia y guarda domicilio, localidad, provincia
y código postal. El costo de envío queda explícitamente marcado como "A coordinar".

Esto es intencional: un código postal por sí solo no determina un precio real de envío.
Para cobrar envío automáticamente hay que integrar el transportista elegido o una tabla de
tarifas del comercio. No se inventa un costo para evitar cobrar de más o de menos.

## Flujo de una compra

1. El cliente elige cantidad y agrega al carrito.
2. Completa sus datos.
3. `/api/checkout` vuelve a consultar precio y stock en Supabase; no confía en el precio del navegador.
4. Se crea un pedido en estado `pendiente`.
5. El cliente paga en Mercado Pago.
6. Mercado Pago notifica al webhook.
7. El webhook consulta el pago real a Mercado Pago y verifica el monto.
8. Supabase descuenta stock y marca `pagado` dentro de una función transaccional.
9. El administrador ve el pedido y puede marcarlo como `preparando`, `enviado` o `entregado`.

## Seguridad implementada

- RLS activado para productos, administradores, pedidos e ítems.
- Los clientes solo pueden leer productos activos.
- Solo usuarios autenticados incluidos en `admin_users` pueden administrar catálogo/pedidos.
- El navegador nunca recibe `SUPABASE_SERVICE_ROLE_KEY` ni `MERCADOPAGO_ACCESS_TOKEN`.
- El backend recalcula precios y valida stock desde la base de datos.
- Los pagos se verifican servidor-a-servidor con Mercado Pago.
- Confirmación de pago y descuento de stock se realizan en Supabase.
- Datos del cliente no se exponen en endpoints públicos.
- Imágenes del panel se limitan a JPG/PNG/WebP y 5 MB.
- Headers de seguridad y protección contra framing/sniffing.
- La sesión del panel se guarda en `sessionStorage`, no en `localStorage`.

Ningún sitio conectado a Internet puede prometer ser "inhackeable". Esta arquitectura evita
los errores críticos más comunes (secretos en frontend, edición pública de base de datos,
precios confiados al cliente y pagos sin verificar), pero igualmente deben usarse contraseñas
fuertes, 2FA en GitHub/Vercel/Supabase/Mercado Pago y mantenerse las cuentas seguras.

## Importante sobre `pagado_revisar_stock`

Si dos personas llegan a pagar el último producto prácticamente al mismo tiempo, el segundo
pedido puede quedar como `pagado_revisar_stock`. El pago existe, pero el panel avisa que hay
que revisar disponibilidad/reembolso. Esto evita modificar stock a valores negativos.
