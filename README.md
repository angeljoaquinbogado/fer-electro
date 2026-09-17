# FER⚡ELECTRO

Ecommerce de FER⚡ELECTRO, organizado para GitHub y despliegue en Vercel.

## Estructura

```text
FER-ELECTRO/
├── index.html                  # Tienda pública
├── admin.html                  # Panel administrativo
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
├── docs/                       # Documentación del proyecto
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
