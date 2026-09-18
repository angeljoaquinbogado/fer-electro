# FER⚡ELECTRO

Ecommerce de FER⚡ELECTRO, organizado para GitHub y despliegue en Vercel.

## Estructura

```text
FER-ELECTRO/
├── index.html                  # Tienda pública
├── admin.html                  # Panel administrativo
├── pedido.html                 # Seguimiento privado de pedidos
├── politicas.html              # Información de compra y privacidad
├── 404.html                    # Página de error
├── vercel.json                 # Configuración y headers de Vercel
├── api/                        # Funciones serverless / backend
├── assets/
│   ├── css/                    # Estilos de tienda y admin
│   ├── js/                     # JavaScript de tienda y admin
│   └── images/
│       ├── brand/              # Logos
│       ├── backgrounds/        # Fondos visuales
│       └── products/           # Imágenes locales de productos
├── database/                   # SQL de Supabase
├── docs/                       # Documentación y checklist de lanzamiento
└── .well-known/security.txt    # Contacto de seguridad
```

## Importante

- `api/` debe permanecer en la raíz para que Vercel detecte las funciones.
- `vercel.json` debe permanecer en la raíz.
- No subir claves privadas, Access Tokens ni `.env` a GitHub.
- Las imágenes nuevas de productos cargadas desde el panel se guardan en Supabase Storage; no hace falta agregarlas manualmente a `assets/images/products/`.

## Desarrollo local

Abrir la carpeta en VS Code y ejecutar `index.html` con Live Server.

## Producción

Los commits a la rama `main` despliegan automáticamente en Vercel si el repositorio está conectado al proyecto.


## Funciones principales

- Catálogo dinámico desde Supabase.
- Carrito, checkout y Mercado Pago.
- Webhook de verificación de pago y descuento atómico de stock.
- Seguimiento privado con token y número profesional `FE-XXXXXXXXXX`.
- Panel de administración con filtros de productos y pedidos, fechas, alertas de stock y exportación CSV.
- Protección anti-spam del checkout.
- Email automático de confirmación mediante Gmail SMTP con contraseña de aplicación.
- SEO básico, sitemap, robots, manifest, favicon y página 404.
- Imágenes locales optimizadas a WebP para mejorar carga.

## Email automático

El webhook envía el email de confirmación después de que Mercado Pago queda aprobado.
La integración usa Gmail SMTP y nunca guarda la contraseña normal de Google.

Variables configuradas en Vercel:

- `GMAIL_USER=ferelectroposadas@gmail.com`
- `GMAIL_APP_PASSWORD` — contraseña de aplicación de Google (secreto)
- `EMAIL_REPLY_TO=ferelectroposadas@gmail.com`
- `PUBLIC_SITE_URL=https://fer-electro.vercel.app`

Si el envío de correo falla, el pago y el pedido igualmente quedan confirmados.

